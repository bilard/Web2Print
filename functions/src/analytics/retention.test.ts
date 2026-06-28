// functions/src/analytics/retention.test.ts
import { describe, it, expect } from 'vitest'
import { cutoffMs } from './retention'

describe('cutoffMs', () => {
  it('coupe ~13 mois avant maintenant', () => {
    const now = Date.UTC(2026, 5, 28)
    const cut = cutoffMs(now)
    expect(cut).toBeLessThan(now)
    // ~13 mois ≈ 395 jours
    expect(Math.round((now - cut) / 86_400_000)).toBeGreaterThanOrEqual(390)
    expect(Math.round((now - cut) / 86_400_000)).toBeLessThanOrEqual(400)
  })
})
