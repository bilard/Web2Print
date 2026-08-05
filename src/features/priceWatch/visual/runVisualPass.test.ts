// La passe est ce qui coûte de l'argent : ces tests figent ce qui NE doit jamais être
// payé deux fois, et ce qui ne doit jamais produire un score inventé.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VisualMap } from './visualStore'
import { VISUAL_PROMPT_VERSION } from './visualMatch'

const analyze = vi.fn()
vi.mock('./runVisualPass', async (orig) => orig())
vi.mock('@/lib/firebase/config', () => ({ functions: {}, db: {} }))
// Le proxy d'image répond comme la Cloud Function : `{ data: { data, mimeType } }`.
// Sans cela, `analyzePair` échoue AVANT l'appel au modèle et tous les tests passeraient
// en mesurant l'absence d'appel.
const proxy = vi.fn(async () => ({ data: { data: 'QUJD', mimeType: 'image/png' } }))
vi.mock('firebase/functions', () => ({ httpsCallable: () => proxy }))
vi.mock('@/features/ai/llmRouter', () => ({ generateJson: (...a: unknown[]) => analyze(...a) }))
vi.mock('@/lib/debugLog', () => ({ debugLog: () => {} }))

const { runVisualPass } = await import('./runVisualPass')

const pair = (i: number, over: Record<string, unknown> = {}) => ({
  url: `https://c.fr/${i}`, sourceImage: 'https://f1/a.jpg', listingImage: 'https://c.fr/b.jpg',
  sourceName: `S${i}`, listingName: `L${i}`, ...over,
})

const known = (url: string, v = VISUAL_PROMPT_VERSION): VisualMap => {
  const m: VisualMap = new Map()
  m.set(hashOf(url), { score: 90, verdict: 'same', note: 'x', at: 1, v })
  return m
}
// Reprend le haché du store pour ne pas dupliquer la règle de clé.
import { urlKey as hashOf } from './visualStore'

beforeEach(() => { analyze.mockReset() })

describe('runVisualPass', () => {
  it('ne repaie JAMAIS une paire déjà jugée', async () => {
    const res = await runVisualPass({
      pairs: [pair(1)], known: known('https://c.fr/1'), budget: 10,
    })
    expect(analyze).not.toHaveBeenCalled()
    expect(res.analyzed).toBe(0)
    expect(res.skipped).toBe(1)
  })

  it('réanalyse quand le PROMPT a changé de version', async () => {
    // Comparer des verdicts produits par deux prompts différents n'a pas de sens : une
    // version périmée doit repasser, sans quoi l'écran mélange deux échelles.
    analyze.mockResolvedValue({ score: 88, verdict: 'same', note: 'ok' })
    const res = await runVisualPass({
      pairs: [pair(1)], known: known('https://c.fr/1', 'ancienne-version'), budget: 10,
    })
    expect(res.analyzed).toBe(1)
  })

  it('saute les paires sans DEUX visuels, sans appel ni score', async () => {
    const res = await runVisualPass({
      pairs: [pair(1, { sourceImage: null }), pair(2, { listingImage: null })],
      known: new Map(), budget: 10,
    })
    expect(analyze).not.toHaveBeenCalled()
    expect(res.analyzed).toBe(0)
    expect(res.map.size).toBe(0)
  })

  it('respecte le budget du run', async () => {
    analyze.mockResolvedValue({ score: 80, verdict: 'same', note: 'ok' })
    const res = await runVisualPass({
      pairs: Array.from({ length: 20 }, (_, i) => pair(i)), known: new Map(), budget: 5,
    })
    expect(analyze).toHaveBeenCalledTimes(5)
    expect(res.analyzed).toBe(5)
  })

  it('compte les verdicts et conserve les précédents', async () => {
    analyze
      .mockResolvedValueOnce({ score: 95, verdict: 'same', note: 'a' })
      .mockResolvedValueOnce({ score: 10, verdict: 'different', note: 'b' })
      .mockResolvedValueOnce({ score: 40, verdict: 'unclear', note: 'c' })
    const res = await runVisualPass({
      pairs: [pair(1), pair(2), pair(3)], known: known('https://c.fr/9'), budget: 10, concurrency: 1,
    })
    expect([res.same, res.different, res.unclear]).toEqual([1, 1, 1])
    // Le verdict déjà connu d'une autre fiche survit à la passe.
    expect(res.map.size).toBe(4)
  })

  it('une analyse en échec ne produit AUCUN verdict', async () => {
    // Un « 0 % » né d'un timeout se lirait comme « pièce différente » et ferait rejeter
    // un appariement correct.
    analyze.mockRejectedValue(new Error('quota'))
    const res = await runVisualPass({ pairs: [pair(1)], known: new Map(), budget: 10 })
    expect(res.analyzed).toBe(0)
    expect(res.map.size).toBe(0)
  })

  it('s’arrête à la demande, en gardant ce qui est fait', async () => {
    analyze.mockResolvedValue({ score: 80, verdict: 'same', note: 'ok' })
    let done = 0
    const res = await runVisualPass({
      pairs: Array.from({ length: 10 }, (_, i) => pair(i)), known: new Map(), budget: 10,
      concurrency: 1, shouldStop: () => done >= 3, onProgress: () => { done++ },
    })
    expect(res.analyzed).toBeLessThan(10)
    expect(res.map.size).toBe(res.analyzed)
  })
})
