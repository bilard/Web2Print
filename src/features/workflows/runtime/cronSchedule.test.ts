// src/features/workflows/runtime/cronSchedule.test.ts
import { describe, it, expect } from 'vitest'
import { computeNextRun, describeCron, normalizeEvery } from './cronSchedule'

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
