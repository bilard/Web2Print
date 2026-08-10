import { describe, it, expect } from 'vitest'
import { durationTrend } from './runHistoryStats'

describe('durationTrend — « la moisson s’allonge » est une information d’exploitation', () => {
  it('compare la moitié récente à la moitié ancienne', () => {
    // Anciens : 10 et 10 min. Récents : 20 et 20 min. → +100 %.
    const runs = [
      { startedAt: 4, endedAt: 4 + 20 * 60_000 },
      { startedAt: 3, endedAt: 3 + 20 * 60_000 },
      { startedAt: 2, endedAt: 2 + 10 * 60_000 },
      { startedAt: 1, endedAt: 1 + 10 * 60_000 },
    ]
    expect(durationTrend(runs)).toBe(100)
  })

  it('ne se prononce pas sous quatre runs — deux points ne font pas une tendance', () => {
    expect(durationTrend([{ startedAt: 1, endedAt: 2 }, { startedAt: 3, endedAt: 4 }])).toBeNull()
  })

  it('ignore les runs sans fin', () => {
    expect(durationTrend([{ startedAt: 1 }, { startedAt: 2 }, { startedAt: 3 }, { startedAt: 4 }])).toBeNull()
  })
})
