import { describe, it, expect, vi } from 'vitest'
import { runCompletionBatches } from './columnCompletionEngine'
import type { ExcelColumn, ExcelRow } from '@/features/excel/types'

const COLS: ExcelColumn[] = [
  { key: 'desc', label: 'Description', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 100 },
]
const noSleep = () => Promise.resolve()

describe('runCompletionBatches', () => {
  it('appelle callBatch par lot et émet done par ligne résolue', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: 'x' }, { _id: 'b', desc: 'y' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockResolvedValue({ a: 'AA', b: 'BB' })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(callBatch).toHaveBeenCalledTimes(1)
    expect(onItem).toHaveBeenCalledWith('a', 'done', 'AA')
    expect(onItem).toHaveBeenCalledWith('b', 'done', 'BB')
  })

  it('marque skipped les lignes dont les références sont vides (sans les envoyer)', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: '' }, { _id: 'b', desc: 'y' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockImplementation(async (chunk: ExcelRow[]) => {
      expect(chunk.map((r) => r._id)).toEqual(['b']) // 'a' filtrée
      return { b: 'BB' }
    })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(onItem).toHaveBeenCalledWith('a', 'skipped')
    expect(onItem).toHaveBeenCalledWith('b', 'done', 'BB')
  })

  it('marque failed une ligne sans résultat dans la réponse', async () => {
    const rows: ExcelRow[] = [{ _id: 'a', desc: 'x' }]
    const onItem = vi.fn()
    const callBatch = vi.fn().mockResolvedValue({}) // aucun résultat
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    expect(onItem).toHaveBeenCalledWith('a', 'failed', undefined, expect.any(String))
  })

  it("s'arrête entre lots si abortRef passe à true et marque le reste aborted", async () => {
    const rows: ExcelRow[] = Array.from({ length: 40 }, (_, i) => ({ _id: `r${i}`, desc: 'x' }))
    const onItem = vi.fn()
    const abortRef = { current: false }
    const callBatch = vi.fn().mockImplementation(async () => { abortRef.current = true; return {} })
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef, sleep: noSleep }, 20)
    expect(callBatch).toHaveBeenCalledTimes(1) // 2e lot non lancé
    expect(onItem).toHaveBeenCalledWith('r20', 'aborted')
  })

  it('circuit-breaker : arrête après 3 erreurs consécutives et marque le reste aborted', async () => {
    const rows: ExcelRow[] = Array.from({ length: 100 }, (_, i) => ({ _id: `r${i}`, desc: 'x' }))
    const onItem = vi.fn()
    const callBatch = vi.fn().mockRejectedValue(new Error('provider down'))
    await runCompletionBatches(rows, '[Description]', COLS, { callBatch, onItem, abortRef: { current: false }, sleep: noSleep }, 20)
    // 5 lots de 20 → callBatch appelé 3 fois max (pas 5)
    expect(callBatch).toHaveBeenCalledTimes(3)
    // Lots 3-4 (index 60..99) → aborted (lots 0-2 ont throw → failed)
    expect(onItem).toHaveBeenCalledWith('r60', 'aborted')
    expect(onItem).toHaveBeenCalledWith('r99', 'aborted')
    // Les lignes des 3 premiers lots sont failed
    expect(onItem).toHaveBeenCalledWith('r0', 'failed', undefined, 'provider down')
  })
})
