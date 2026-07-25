import { describe, it, expect } from 'vitest'
import { mapWithConcurrency } from './concurrency'

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('mapWithConcurrency', () => {
  it('préserve l’ordre des résultats malgré des fins dans le désordre', async () => {
    const out = await mapWithConcurrency([30, 5, 20, 1], 4, async (ms, i) => { await tick(ms); return i })
    expect(out).toEqual([0, 1, 2, 3])
  })

  it('ne dépasse JAMAIS le plafond de tâches simultanées', async () => {
    let inFlight = 0
    let peak = 0
    await mapWithConcurrency(Array.from({ length: 20 }), 4, async () => {
      inFlight++; peak = Math.max(peak, inFlight)
      await tick(5)
      inFlight--
    })
    expect(peak).toBe(4)
  })

  it('parallélise réellement (10 tâches de 20 ms à 5 de front ≪ 200 ms séquentiels)', async () => {
    const t0 = Date.now()
    await mapWithConcurrency(Array.from({ length: 10 }), 5, async () => { await tick(20) })
    expect(Date.now() - t0).toBeLessThan(150)
  })

  it('traite TOUS les éléments même quand ils dépassent le plafond', async () => {
    const seen: number[] = []
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 2, async (n) => { await tick(1); seen.push(n) })
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('liste vide → aucun worker, aucun résultat', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([])
  })

  it('plafond ≤ 0 retombe à 1 (jamais zéro worker → jamais de blocage)', async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n * 2)).toEqual([2, 4])
  })
})
