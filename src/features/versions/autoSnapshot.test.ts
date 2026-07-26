import { describe, it, expect } from 'vitest'
import {
  AUTO_SNAPSHOT_THROTTLE_MS,
  MAX_AUTO_SNAPSHOTS,
  autoSnapshotSlot,
  shouldAutoSnapshot,
} from './autoSnapshot'

describe('autoSnapshotSlot', () => {
  it('reste stable dans une même fenêtre de throttle', () => {
    // t0 aligné sur une frontière de fenêtre pour couvrir toute la fenêtre.
    const t0 = Math.floor(1_700_000_000_000 / AUTO_SNAPSHOT_THROTTLE_MS) * AUTO_SNAPSHOT_THROTTLE_MS
    expect(autoSnapshotSlot(t0)).toBe(autoSnapshotSlot(t0 + AUTO_SNAPSHOT_THROTTLE_MS - 1))
  })
  it('change de slot à la fenêtre suivante et boucle sur MAX_AUTO_SNAPSHOTS', () => {
    const t0 = Math.floor(1_700_000_000_000 / AUTO_SNAPSHOT_THROTTLE_MS) * AUTO_SNAPSHOT_THROTTLE_MS
    const s0 = autoSnapshotSlot(t0)
    expect(autoSnapshotSlot(t0 + AUTO_SNAPSHOT_THROTTLE_MS)).toBe((s0 + 1) % MAX_AUTO_SNAPSHOTS)
    expect(autoSnapshotSlot(t0 + MAX_AUTO_SNAPSHOTS * AUTO_SNAPSHOT_THROTTLE_MS)).toBe(s0)
  })
  it('produit toujours un slot dans [0, MAX)', () => {
    for (const t of [0, 1, 599_999, 600_000, 86_400_000, 1_750_000_123_456]) {
      const slot = autoSnapshotSlot(t)
      expect(slot).toBeGreaterThanOrEqual(0)
      expect(slot).toBeLessThan(MAX_AUTO_SNAPSHOTS)
    }
  })
})

describe('shouldAutoSnapshot', () => {
  it('premier save de la session → snapshot immédiat', () => {
    expect(shouldAutoSnapshot(undefined, 1_000)).toBe(true)
  })
  it('throttle dans la fenêtre, autorise après', () => {
    const t0 = 1_700_000_000_000
    expect(shouldAutoSnapshot(t0, t0 + AUTO_SNAPSHOT_THROTTLE_MS - 1)).toBe(false)
    expect(shouldAutoSnapshot(t0, t0 + AUTO_SNAPSHOT_THROTTLE_MS)).toBe(true)
  })
})
