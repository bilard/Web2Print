// src/features/excel/ai-image/imageGenEngine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildImageJobs, runImageGenQueue, type ImageGenJob, type ImageGenStatus } from './imageGenEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const col = (key: string, label: string): ExcelColumn => ({
  key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100,
})
const columns: ExcelColumn[] = [col('nom', 'Nom'), col('desc', 'Description'), col('image', 'Image')]

const row = (id: string, extra: Partial<ExcelRow> = {}): ExcelRow => ({ _id: id, ...extra })

function collect() {
  const statuses = new Map<string, { status: ImageGenStatus; value?: string; error?: string }>()
  const onItem = (rowId: string, status: ImageGenStatus, value?: string, error?: string) => {
    statuses.set(rowId, { status, value, error })
  }
  return { statuses, onItem }
}

describe('buildImageJobs', () => {
  it('résout les références [Colonne] et détecte les cellules déjà remplies', () => {
    const rows = [
      row('a', { nom: 'Colle', desc: 'contact 1L', image: null }),
      row('b', { nom: 'Vis', desc: 'inox', image: 'https://drive.google.com/file/d/x/view' }),
      row('c', { nom: null, desc: null }),
    ]
    const jobs = buildImageJobs(rows, 'Photo de [Nom] — [Description]', columns, 'image')
    expect(jobs[0]).toEqual({ rowId: 'a', prompt: 'Photo de Colle — contact 1L', alreadyFilled: false })
    expect(jobs[1].alreadyFilled).toBe(true)
    expect(jobs[2].prompt).toBe('') // toutes les refs vides → skip (pas de visuel générique)
  })

  it('garde le prompt si au moins une référence résout', () => {
    const jobs = buildImageJobs([row('a', { nom: 'Colle' })], 'Photo de [Nom] — [Description]', columns, 'image')
    expect(jobs[0].prompt).toBe('Photo de Colle —')
  })

  it('un gabarit sans référence reste tel quel', () => {
    const jobs = buildImageJobs([row('a')], 'Photo packshot', columns, 'image')
    expect(jobs[0].prompt).toBe('Photo packshot')
  })

  it('marque alreadyFilled=false pour une cellule espace/vide', () => {
    const jobs = buildImageJobs([row('a', { image: '  ' })], 'x', columns, 'image')
    expect(jobs[0].alreadyFilled).toBe(false)
  })
})

describe('runImageGenQueue', () => {
  const job = (rowId: string, prompt = 'p', alreadyFilled = false): ImageGenJob => ({ rowId, prompt, alreadyFilled })

  it('skippe les cellules remplies (onlyEmpty défaut) et les prompts vides, génère le reste', async () => {
    const { statuses, onItem } = collect()
    const gen = vi.fn(async (j: ImageGenJob) => `link-${j.rowId}`)
    await runImageGenQueue(
      [job('a'), job('b', 'p', true), job('c', '')],
      { generateAndStore: gen, onItem, abortRef: { current: false } },
    )
    expect(statuses.get('a')).toEqual({ status: 'done', value: 'link-a', error: undefined })
    expect(statuses.get('b')?.status).toBe('skipped')
    expect(statuses.get('c')?.status).toBe('skipped')
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('regénère les cellules remplies quand onlyEmpty=false', async () => {
    const { statuses, onItem } = collect()
    await runImageGenQueue(
      [job('a', 'p', true)],
      { generateAndStore: async () => 'link', onItem, abortRef: { current: false } },
      { onlyEmpty: false },
    )
    expect(statuses.get('a')?.status).toBe('done')
  })

  it('marque failed avec le message d’erreur sans stopper la file', async () => {
    const { statuses, onItem } = collect()
    const gen = vi.fn(async (j: ImageGenJob) => {
      if (j.rowId === 'a') throw new Error('quota dépassé')
      return 'ok'
    })
    await runImageGenQueue([job('a'), job('b')], {
      generateAndStore: gen, onItem, abortRef: { current: false }, concurrency: 1,
    })
    expect(statuses.get('a')).toEqual({ status: 'failed', value: undefined, error: 'quota dépassé' })
    expect(statuses.get('b')?.status).toBe('done')
  })

  it('circuit-breaker : 3 échecs consécutifs → le reste est aborted', async () => {
    const { statuses, onItem } = collect()
    const gen = vi.fn(async () => { throw new Error('down') })
    await runImageGenQueue([job('a'), job('b'), job('c'), job('d'), job('e')], {
      generateAndStore: gen, onItem, abortRef: { current: false }, concurrency: 1,
    })
    expect(statuses.get('c')?.status).toBe('failed')
    expect(statuses.get('d')?.status).toBe('aborted')
    expect(statuses.get('e')?.status).toBe('aborted')
    expect(gen).toHaveBeenCalledTimes(3)
  })

  it('un succès remet le compteur d’échecs à zéro', async () => {
    const { statuses, onItem } = collect()
    let n = 0
    const gen = vi.fn(async () => {
      n++
      if (n === 3) return 'ok' // a,b échouent, c réussit, d,e échouent → pas de trip
      throw new Error('flaky')
    })
    await runImageGenQueue([job('a'), job('b'), job('c'), job('d'), job('e')], {
      generateAndStore: gen, onItem, abortRef: { current: false }, concurrency: 1,
    })
    expect(statuses.get('c')?.status).toBe('done')
    expect(statuses.get('e')?.status).toBe('failed')
    expect(gen).toHaveBeenCalledTimes(5)
  })

  it('abort : les jobs restants sont marqués aborted', async () => {
    const { statuses, onItem } = collect()
    const abortRef = { current: false }
    const gen = vi.fn(async (j: ImageGenJob) => {
      if (j.rowId === 'a') abortRef.current = true
      return 'ok'
    })
    await runImageGenQueue([job('a'), job('b'), job('c')], {
      generateAndStore: gen, onItem, abortRef, concurrency: 1,
    })
    expect(statuses.get('a')?.status).toBe('done')
    expect(statuses.get('b')?.status).toBe('aborted')
    expect(statuses.get('c')?.status).toBe('aborted')
  })

  it('respecte la concurrence demandée', async () => {
    let inFlight = 0
    let peak = 0
    const gen = async () => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return 'ok'
    }
    const { onItem } = collect()
    await runImageGenQueue(
      Array.from({ length: 6 }, (_, i) => job(`r${i}`)),
      { generateAndStore: gen, onItem, abortRef: { current: false }, concurrency: 2 },
    )
    expect(peak).toBeLessThanOrEqual(2)
    expect(peak).toBeGreaterThan(1)
  })
})
