// functions/src/workflow/cronSchedule.test.ts
import { describe, it, expect } from 'vitest'
import { computeNextRun, normalizeEvery } from './cronSchedule'

// Helpers de vérification : relisent le résultat en horloge murale Europe/Paris.
const parisHM = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))
const parisWeekday = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(ts))

// Jeudi 11 juin 2026, 10:00 Paris (été = UTC+2 → 08:00 UTC).
const from = Date.UTC(2026, 5, 11, 8, 0, 0)

describe('normalizeEvery', () => {
  it('normalise every < 1 vers 1', () => {
    expect(normalizeEvery(0)).toBe(1)
    expect(normalizeEvery(-3)).toBe(1)
    expect(normalizeEvery(2.9)).toBe(2)
  })
})

describe('computeNextRun — intervalle', () => {
  it('hour reste un intervalle fixe', () => {
    expect(computeNextRun({ enabled: true, every: 2, unit: 'hour' }, from)).toBe(from + 2 * 3_600_000)
  })
})

describe('computeNextRun — ancré à une heure précise (Europe/Paris)', () => {
  it('day à 14:30 → aujourd’hui 14:30 Paris (heure pas encore passée)', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'day', atTime: '14:30' }, from)
    expect(next).toBeGreaterThan(from)
    expect(parisHM(next)).toBe('14:30')
  })
  it('day à 08:00 → demain (heure déjà passée à 10:00)', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'day', atTime: '08:00' }, from)
    expect(parisHM(next)).toBe('08:00')
    // > 12h après `from` (donc le lendemain, pas aujourd’hui)
    expect(next - from).toBeGreaterThan(12 * 3_600_000)
  })
  it('day sans atTime → défaut 09:00', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'day' }, from)
    expect(parisHM(next)).toBe('09:00')
  })
})

describe('computeNextRun — jour de la semaine (Europe/Paris)', () => {
  it('week lundi 09:00 → prochain lundi (from = jeudi)', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'week', weekday: 1, atTime: '09:00' }, from)
    expect(parisWeekday(next)).toBe('Mon')
    expect(parisHM(next)).toBe('09:00')
    expect(next).toBeGreaterThan(from)
  })
  it('week samedi 18:00 → ce samedi (encore à venir)', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'week', weekday: 6, atTime: '18:00' }, from)
    expect(parisWeekday(next)).toBe('Sat')
    expect(parisHM(next)).toBe('18:00')
    expect(next - from).toBeLessThan(7 * 86_400_000)
  })
})

describe('computeNextRun — mois', () => {
  it('month tous les 2 mois à 08:00 (déjà passé) → +2 mois → août', () => {
    const next = computeNextRun({ enabled: true, every: 2, unit: 'month', atTime: '08:00' }, from)
    expect(parisHM(next)).toBe('08:00')
    expect(new Date(next).getUTCMonth()).toBe(7) // août (0-indexé)
  })
})
