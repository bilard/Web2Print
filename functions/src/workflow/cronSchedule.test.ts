// functions/src/workflow/cronSchedule.test.ts
import { describe, it, expect } from 'vitest'
import { computeNextRun, computeNextCycleRun, normalizeEvery, sanitizeCycle } from './cronSchedule'

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
  it('minute = intervalle fixe (ex. toutes les 10 min)', () => {
    expect(computeNextRun({ enabled: true, every: 10, unit: 'minute' }, from)).toBe(from + 10 * 60_000)
  })
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
  it('week « Tous les jours » (weekday -1) → cadence quotidienne', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'week', weekday: -1, atTime: '08:00' }, from)
    expect(parisHM(next)).toBe('08:00')
    // 08:00 déjà passé à 10:00 → demain (< 24h après from)
    expect(next - from).toBeLessThan(86_400_000)
  })
})

describe('computeNextRun — mois', () => {
  it('month tous les 2 mois à 08:00 (déjà passé) → +2 mois → août', () => {
    const next = computeNextRun({ enabled: true, every: 2, unit: 'month', atTime: '08:00' }, from)
    expect(parisHM(next)).toBe('08:00')
    expect(new Date(next).getUTCMonth()).toBe(7) // août (0-indexé)
  })
})

// ————— Relance calendaire du cycle (parité client) —————
const parisDate = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts))

describe('computeNextCycleRun (serveur)', () => {
  it('week : prochain jour coché (vendredi) à l’heure voulue', () => {
    const next = computeNextCycleRun({ enabled: true, kind: 'week', atTime: '07:00', weekdays: [5] }, from)
    expect(next).not.toBeNull()
    expect(parisWeekday(next!)).toBe('Fri')
    expect(parisHM(next!)).toBe('07:00')
    expect(parisDate(next!)).toBe('12/06/2026')
  })
  it('day : tous les 2 jours à 07:00 (aujourd’hui 07:00 déjà passé → +2 j)', () => {
    const next = computeNextCycleRun({ enabled: true, kind: 'day', atTime: '07:00', every: 2 }, from)
    expect(parisHM(next!)).toBe('07:00')
    expect(parisDate(next!)).toBe('13/06/2026')
  })
  it('month : quantième clampé au dernier jour des mois courts (31 → 30 juin)', () => {
    const next = computeNextCycleRun({ enabled: true, kind: 'month', atTime: '07:00', monthday: 31, every: 1 }, from)
    expect(parisDate(next!)).toBe('30/06/2026')
  })
  it('dates : plus proche date future ; toutes passées → null', () => {
    const next = computeNextCycleRun(
      { enabled: true, kind: 'dates', atTime: '07:00', dates: ['2026-01-01', '2026-10-14', '2026-07-01'] }, from,
    )
    expect(parisDate(next!)).toBe('01/07/2026')
    expect(computeNextCycleRun({ enabled: true, kind: 'dates', atTime: '07:00', dates: ['2026-01-01'] }, from)).toBeNull()
  })
})

describe('sanitizeCycle (serveur)', () => {
  it('null si absent/désactivé ; normalise et déduplique sinon', () => {
    expect(sanitizeCycle(undefined)).toBeNull()
    const c = sanitizeCycle({ enabled: true, kind: 'week', atTime: 'bad', weekdays: [5, 5, 9, 1], dates: ['2026-10-14', 'nope'] })!
    expect(c).toEqual({ enabled: true, kind: 'week', atTime: '07:00', every: 1, weekdays: [1, 5], monthday: 1, dates: ['2026-10-14'] })
  })
})
