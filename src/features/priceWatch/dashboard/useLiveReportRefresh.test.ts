// Tests de la décision pure d'actualisation live du rapport (useLiveReportRefresh).
import { describe, it, expect } from 'vitest'
import { shouldRefreshReport, MIN_REPORT_AGE_MS } from './useLiveReportRefresh'

const NOW = 1_700_000_000_000

describe('shouldRefreshReport', () => {
  const base = {
    runAt: NOW - MIN_REPORT_AGE_MS - 1000, // rapport assez vieux
    lastCollectAt: NOW - 30_000,           // moisson active (heartbeat < 3 min)
    now: NOW,
    visible: true,
  }

  it('recalcule quand la moisson est active et le rapport a vieilli', () => {
    expect(shouldRefreshReport(base)).toBe(true)
  })
  it('jamais en arrière-plan (onglet caché)', () => {
    expect(shouldRefreshReport({ ...base, visible: false })).toBe(false)
  })
  it('jamais sans premier « Comparer » (runAt = 0 : pas de catalogue source)', () => {
    expect(shouldRefreshReport({ ...base, runAt: 0 })).toBe(false)
  })
  it('throttle : rapport trop récent → attendre', () => {
    expect(shouldRefreshReport({ ...base, runAt: NOW - 60_000 })).toBe(false)
  })
  it('collecte à l’arrêt (heartbeat > 3 min) → rien à recalculer', () => {
    expect(shouldRefreshReport({ ...base, lastCollectAt: NOW - 10 * 60_000 })).toBe(false)
  })
  it('aucune méta de moisson → rien', () => {
    expect(shouldRefreshReport({ ...base, lastCollectAt: null })).toBe(false)
  })
  it('rien de neuf depuis le dernier rapport → pas de recalcul pour rien', () => {
    // Moisson encore « chaude » mais sa dernière écriture PRÉCÈDE le rapport.
    const runAt = NOW - MIN_REPORT_AGE_MS - 1000
    expect(shouldRefreshReport({ ...base, runAt, lastCollectAt: runAt - 5_000 })).toBe(false)
  })
})
