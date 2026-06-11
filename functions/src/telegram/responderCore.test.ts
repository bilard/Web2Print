import { describe, it, expect } from 'vitest'
import {
  parseInboxCommand, resolveRun, injectInput, browserOnlyTypes, truncateForTelegram, maskToken,
} from './responderCore'
import type { ServerWorkflow } from '../workflow/types'

const wf = (name: string, types: string[]): ServerWorkflow => ({
  id: name, name, ownerId: 'u1',
  nodes: types.map((type, i) => ({ id: `n${i}`, type, config: {} })),
  edges: [],
})

describe('parseInboxCommand (parité worker navigateur)', () => {
  it('reconnaît /start, /flow, /run, /clear, simple', () => {
    expect(parseInboxCommand('/start')).toEqual({ kind: 'ignore' })
    expect(parseInboxCommand('/flow scrape ce site')).toEqual({ kind: 'flow', prompt: 'scrape ce site' })
    expect(parseInboxCommand('/run Veille prix')).toEqual({ kind: 'run', rest: 'Veille prix' })
    expect(parseInboxCommand('/vider')).toEqual({ kind: 'clear' })
    expect(parseInboxCommand('quel est le prix du cuivre ?')).toEqual({ kind: 'simple' })
  })
})

describe('resolveRun', () => {
  const wfs = [wf('Scrape', ['scrape-url']), wf('Scrape produits', ['scrape-url', 'save-pim'])]

  it('retient le plus long nom préfixe et extrait l’entrée', () => {
    const r = resolveRun(wfs, 'Scrape produits : https://ex.com')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.workflow.name).toBe('Scrape produits')
      expect(r.input).toBe('https://ex.com')
    }
  })

  it('« Scrape » ne matche pas « Scraper x » (séparateur requis)', () => {
    const r = resolveRun(wfs, 'Scraperie')
    expect(r.ok).toBe(false)
  })

  it('/run seul → liste', () => {
    const r = resolveRun(wfs, '')
    expect(r).toMatchObject({ ok: false, reason: 'no-name', available: ['Scrape', 'Scrape produits'] })
  })
})

describe('injectInput', () => {
  it('URL → scrape-url.urls ; texte → text-input.text', () => {
    const both = wf('x', ['scrape-url', 'text-input'])
    const r1 = injectInput(both, 'https://ex.com/p1')
    expect(r1.injected).toBe(1)
    expect((r1.workflow.nodes[0].config as { urls?: string }).urls).toBe('https://ex.com/p1')
    const r2 = injectInput(both, 'perceuses 18V')
    expect((r2.workflow.nodes[1].config as { text?: string }).text).toBe('perceuses 18V')
  })

  it('aucun node d’entrée → injected 0, workflow intact', () => {
    const r = injectInput(wf('x', ['save-pim']), 'texte')
    expect(r.injected).toBe(0)
  })
})

describe('browserOnlyTypes', () => {
  it('vide pour un workflow 100 % serveur', () => {
    expect(browserOnlyTypes(wf('ok', ['scrape-url', 'price-watch', 'send-telegram', 'save-pim']))).toEqual([])
  })
  it('signale les nodes de rendu et fichiers manuels', () => {
    expect(browserOnlyTypes(wf('ko', ['scrape-url', 'export-pdf', 'upload']))).toEqual(
      expect.arrayContaining(['export-pdf', 'upload']),
    )
  })
})

describe('utilitaires', () => {
  it('tronque à 4096 et masque les tokens', () => {
    expect(truncateForTelegram('x'.repeat(5000)).length).toBe(4096)
    expect(maskToken('err bot123456:ABC-def_789 fin')).toBe('err bot*** fin')
  })
})
