import { describe, it, expect } from 'vitest'
import {
  computeNextRun, computeNextCycleRun, describeCron, describeCycle, normalizeEvery, sanitizeCycle,
} from './cronSchedule'

const parisHM = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts))
const parisWeekday = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(ts))

// Jeudi 11 juin 2026, 10:00 Paris (été = UTC+2).
const from = Date.UTC(2026, 5, 11, 8, 0, 0)

describe('computeNextRun (client)', () => {
  it('minute/hour = intervalle fixe', () => {
    expect(computeNextRun({ enabled: true, every: 5, unit: 'minute' }, from)).toBe(from + 5 * 60_000)
    expect(computeNextRun({ enabled: true, every: 2, unit: 'hour' }, from)).toBe(from + 2 * 3_600_000)
  })
  it('day ancré à une heure précise (Europe/Paris)', () => {
    expect(parisHM(computeNextRun({ enabled: true, every: 1, unit: 'day', atTime: '14:30' }, from))).toBe('14:30')
  })
  it('week ancré à un jour de semaine + heure', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'week', weekday: 1, atTime: '09:00' }, from)
    expect(parisWeekday(next)).toBe('Mon')
    expect(parisHM(next)).toBe('09:00')
  })
  it('week « Tous les jours » (weekday -1) = quotidien', () => {
    const next = computeNextRun({ enabled: true, every: 1, unit: 'week', weekday: -1, atTime: '14:30' }, from)
    expect(parisHM(next)).toBe('14:30')
    expect(next - from).toBeLessThan(86_400_000)
  })
})

const parisDate = (ts: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts))

describe('computeNextCycleRun (client)', () => {
  it('week : prochain jour coché (vendredi) à l’heure voulue', () => {
    // from = jeudi → le vendredi 12/06/2026 07:00 est la prochaine occurrence.
    const next = computeNextCycleRun({ enabled: true, kind: 'week', atTime: '07:00', weekdays: [5] }, from)
    expect(next).not.toBeNull()
    expect(parisWeekday(next!)).toBe('Fri')
    expect(parisHM(next!)).toBe('07:00')
    expect(parisDate(next!)).toBe('12/06/2026')
  })
  it('week multi-jours : la plus proche occurrence gagne', () => {
    // Jeudi 10:00, jours cochés = lundi + jeudi à 07:00 (déjà passé ce jeudi) → lundi.
    const next = computeNextCycleRun({ enabled: true, kind: 'week', atTime: '07:00', weekdays: [1, 4] }, from)
    expect(parisWeekday(next!)).toBe('Mon')
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
  it('dates : la plus proche date FUTURE gagne, les passées sont ignorées', () => {
    const next = computeNextCycleRun(
      { enabled: true, kind: 'dates', atTime: '07:00', dates: ['2026-01-01', '2026-10-14', '2026-07-01'] }, from,
    )
    expect(parisDate(next!)).toBe('01/07/2026')
    expect(parisHM(next!)).toBe('07:00')
  })
  it('dates toutes passées → null (la planification se désactive)', () => {
    expect(computeNextCycleRun({ enabled: true, kind: 'dates', atTime: '07:00', dates: ['2026-01-01'] }, from)).toBeNull()
  })
})

describe('sanitizeCycle', () => {
  it('null si absent ou désactivé', () => {
    expect(sanitizeCycle(undefined)).toBeNull()
    expect(sanitizeCycle({ enabled: false, kind: 'week' })).toBeNull()
  })
  it('normalise et déduplique (tous champs définis, Firestore-safe)', () => {
    const c = sanitizeCycle({ enabled: true, kind: 'week', atTime: 'bad', weekdays: [5, 5, 9, 1], dates: ['2026-10-14', 'nope'] })!
    expect(c).toEqual({ enabled: true, kind: 'week', atTime: '07:00', every: 1, weekdays: [1, 5], monthday: 1, dates: ['2026-10-14'] })
  })
})

describe('describeCycle', () => {
  it('hebdo multi-jours', () => {
    expect(describeCycle({ enabled: true, kind: 'week', atTime: '07:00', weekdays: [5] })).toBe('cycle ven. à 07:00')
  })
  it('dates précises', () => {
    expect(describeCycle({ enabled: true, kind: 'dates', atTime: '07:00', dates: ['2026-10-14', '2026-12-01'] }))
      .toBe('cycle le 14/10/2026 à 07:00 (+1)')
  })
})

describe('describeCron', () => {
  it('jour avec heure', () => {
    expect(describeCron({ enabled: true, every: 1, unit: 'day', atTime: '14:30' })).toBe('1 jour(s) à 14:30')
  })
  it('semaine avec jour nommé', () => {
    expect(describeCron({ enabled: true, every: 1, unit: 'week', weekday: 1, atTime: '09:00' })).toBe('lundi à 09:00')
  })
  it('normalizeEvery borne à 1', () => {
    expect(normalizeEvery(0)).toBe(1)
  })
})
