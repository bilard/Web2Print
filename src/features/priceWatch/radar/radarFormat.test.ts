import { describe, it, expect } from 'vitest'
import { fmtCompactDuration, fmtCountdown, fmtDuration, timeAgo } from './radarFormat'

const S = 1000, M = 60_000, H = 3_600_000, J = 86_400_000

describe('durées compactes (place gagnée en largeur sur mobile)', () => {
  it('colle l’unité au nombre', () => {
    expect(fmtCompactDuration(50 * S)).toBe('50s')
    expect(fmtCompactDuration(10 * M + 53 * S)).toBe('10mn 53s')
    expect(fmtCompactDuration(2 * H + 5 * M)).toBe('2h 5mn')
    expect(fmtCompactDuration(3 * J + 4 * H)).toBe('3j 4h')
  })

  it('décompte échu = « maintenant » (jamais de durée négative)', () => {
    expect(fmtCountdown(0)).toBe('maintenant')
    expect(fmtCountdown(-5000)).toBe('maintenant')
    expect(fmtCountdown(59 * S)).toBe('59s')
  })

  it('fmtDuration reste compact et garde le tiret pour rien', () => {
    expect(fmtDuration(12 * S)).toBe('12s')
    expect(fmtDuration(45 * M)).toBe('45mn')
    expect(fmtDuration(2 * H + 5 * M)).toBe('2h05')
    expect(fmtDuration(0)).toBe('—')
    expect(fmtDuration(null)).toBe('—')
  })

  it('temps relatif compact', () => {
    const now = 1_700_000_000_000
    expect(timeAgo(now - 30 * S, now)).toBe("à l'instant")
    expect(timeAgo(now - 10 * M, now)).toBe('il y a 10mn')
    expect(timeAgo(now - 4 * H, now)).toBe('il y a 4h')
    expect(timeAgo(now - 3 * J, now)).toBe('il y a 3j')
  })
})
