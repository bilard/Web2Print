import { describe, it, expect } from 'vitest'
import { canOverwrite, shouldBeat, CLIENT_BEAT_INTERVAL_MS } from './publishClientRun'

const NOW = 1_700_000_000_000

describe('canOverwrite — ne pas piétiner un run vivant', () => {
  it('écrit quand le document est vide', () => {
    expect(canOverwrite(null, 'run-1', NOW)).toBe(true)
  })

  it('écrit quand le document porte NOTRE run', () => {
    expect(canOverwrite({ runId: 'run-1', origin: 'server', beatAt: NOW }, 'run-1', NOW)).toBe(true)
  })

  it('REFUSE d’écraser un autre run qui vient d’écrire', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 30_000 }, 'run-1', NOW)).toBe(false)
  })

  it('reprend la main sur un autre run muet depuis plus de trois minutes', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 4 * 60_000 }, 'run-1', NOW)).toBe(true)
  })

  it('reprend la main quand l’autre run est terminé', () => {
    expect(canOverwrite({ runId: 'cron-9', origin: 'server', beatAt: NOW - 10_000, endedAt: NOW - 5_000 }, 'run-1', NOW)).toBe(true)
  })
})

describe('shouldBeat', () => {
  it('bat au premier appel', () => {
    expect(shouldBeat(0, NOW, false)).toBe(true)
  })

  it('se tait avant l’intervalle', () => {
    expect(shouldBeat(NOW, NOW + CLIENT_BEAT_INTERVAL_MS - 1, false)).toBe(false)
  })

  it('bat toujours quand on force — un changement d’état de carte ne s’attend pas', () => {
    expect(shouldBeat(NOW, NOW + 1, true)).toBe(true)
  })
})
