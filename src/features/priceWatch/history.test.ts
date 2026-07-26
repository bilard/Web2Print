import { describe, it, expect } from 'vitest'
import { retainHistory, DETAIL_WINDOW_DAYS } from './history'
import type { KpiHistoryPoint } from './types'

const DAY = 86_400_000
const NOW = new Date('2026-07-25T12:00:00').getTime()

const pt = (at: number, products = 1): KpiHistoryPoint => ({
  at, products, cheaperThanMe: 0, dearerThanMe: 0, aligned: 0, productsUndercut: 0,
})

describe('retainHistory', () => {
  it('conserve TOUS les points de la fenêtre de détail', () => {
    const pts = [pt(NOW - 3 * 3600_000), pt(NOW - 2 * 3600_000), pt(NOW - 3600_000), pt(NOW)]
    expect(retainHistory(pts, NOW, 90)).toHaveLength(4)
  })

  it('rollup journalier au-delà de la fenêtre : un seul point par journée', () => {
    const old = NOW - (DETAIL_WINDOW_DAYS + 5) * DAY
    const pts = [pt(old, 1), pt(old + 3600_000, 2), pt(old + 7200_000, 3), pt(NOW, 9)]
    const kept = retainHistory(pts, NOW, 90)
    expect(kept).toHaveLength(2)
    // Le point retenu de la journée est le DERNIER (index le plus complet).
    expect(kept[0].products).toBe(3)
    expect(kept[1].products).toBe(9)
  })

  it('journées distinctes hors fenêtre : un point chacune', () => {
    const base = NOW - (DETAIL_WINDOW_DAYS + 10) * DAY
    const pts = [pt(base), pt(base + DAY), pt(base + 2 * DAY)]
    expect(retainHistory(pts, NOW, 90)).toHaveLength(3)
  })

  it('dégrade la fenêtre récente elle-même quand le plafond est atteint', () => {
    // 5 points/jour sur 6 jours = 30 points, tous dans la fenêtre de détail.
    const pts: KpiHistoryPoint[] = []
    for (let d = 6; d >= 1; d--) for (let i = 0; i < 5; i++) pts.push(pt(NOW - d * DAY + i * 3600_000))
    const kept = retainHistory(pts, NOW, 10)
    expect(kept).toHaveLength(6) // rollup total → 1 par jour
  })

  it('ne dépasse JAMAIS le plafond', () => {
    const pts = Array.from({ length: 200 }, (_, i) => pt(NOW - (200 - i) * DAY))
    expect(retainHistory(pts, NOW, 90)).toHaveLength(90)
  })

  it('trie par date et garde le plus récent en dernier', () => {
    const kept = retainHistory([pt(NOW), pt(NOW - 3600_000)], NOW, 90)
    expect(kept[kept.length - 1].at).toBe(NOW)
  })

  it('historique vide → tableau vide', () => {
    expect(retainHistory([], NOW, 90)).toEqual([])
  })
})
