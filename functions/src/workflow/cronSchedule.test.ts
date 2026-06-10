// functions/src/workflow/cronSchedule.test.ts
import { describe, it, expect } from 'vitest'
import { computeNextRun, normalizeEvery, type CronConfig } from './cronSchedule'

const base = Date.UTC(2026, 0, 15, 12, 0, 0) // 2026-01-15T12:00:00Z

describe('computeNextRun', () => {
  it('ajoute des heures/jours/semaines fixes', () => {
    expect(computeNextRun({ enabled: true, every: 2, unit: 'hour' }, base)).toBe(base + 2 * 3_600_000)
    expect(computeNextRun({ enabled: true, every: 1, unit: 'day' }, base)).toBe(base + 86_400_000)
    expect(computeNextRun({ enabled: true, every: 1, unit: 'week' }, base)).toBe(base + 604_800_000)
  })
  it('ajoute des mois en arithmétique calendaire', () => {
    const next = computeNextRun({ enabled: true, every: 2, unit: 'month' }, base)
    expect(new Date(next).getUTCMonth()).toBe(2) // janvier + 2 = mars
  })
  it('normalise every < 1 vers 1', () => {
    expect(normalizeEvery(0)).toBe(1)
    expect(normalizeEvery(-3)).toBe(1)
    expect(normalizeEvery(2.9)).toBe(2)
  })
})
