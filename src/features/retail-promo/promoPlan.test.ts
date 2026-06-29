import { describe, it, expect } from 'vitest'
import { validatePromoPlan, repairPromoPlan } from './promoPlan'
import type { PromoLayout } from './promoTypes'

const fallback: PromoLayout = {
  id: 'fb', label: 'Repli', width: 794, height: 1123, background: '#ffffff',
  blocks: [{ blockId: 'cadre-photo', xPct: 0.1, yPct: 0.1, wPct: 0.8, hPct: 0.5 }],
}

describe('validatePromoPlan', () => {
  it('accepte un plan bien formé', () => {
    expect(validatePromoPlan({ ...fallback, blocks: [{ blockId: 'accroche', xPct: 0, yPct: 0, wPct: 1, hPct: 0.2 }] })).toBe(true)
  })
  it('rejette si blocs manquants ou champs absents', () => {
    expect(validatePromoPlan({ id: 'x' })).toBe(false)
    expect(validatePromoPlan(null)).toBe(false)
  })
})

describe('repairPromoPlan', () => {
  it('supprime les blocs inconnus et clamp les %', () => {
    const out = repairPromoPlan(
      { id: 'a', label: 'A', width: 794, height: 1123, background: '#fff', blocks: [
        { blockId: 'inconnu', xPct: 0, yPct: 0, wPct: 1, hPct: 1 },
        { blockId: 'badge-remise', xPct: -1, yPct: 2, wPct: 5, hPct: 0.3 },
      ] },
      fallback,
    )
    expect(out.blocks.every((b) => (b.blockId as string) !== 'inconnu')).toBe(true)
    const badge = out.blocks.find((b) => b.blockId === 'badge-remise')!
    expect(badge.xPct).toBeGreaterThanOrEqual(0)
    expect(badge.wPct).toBeLessThanOrEqual(1)
  })
  it('repli complet si plan irrécupérable (aucun bloc valide)', () => {
    const out = repairPromoPlan({ blocks: [{ blockId: 'inconnu', xPct: 0, yPct: 0, wPct: 1, hPct: 1 }] }, fallback)
    expect(out.blocks).toEqual(fallback.blocks)
    expect(out.width).toBe(fallback.width)
  })
})
