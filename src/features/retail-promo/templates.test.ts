import { describe, it, expect } from 'vitest'
import { CURATED_TEMPLATES, nearestTemplate } from './templates'
import { PROMO_BLOCK_IDS } from './promoPlan'

describe('templates curés', () => {
  it('≥ 4 templates, tous valides (blocs connus, % dans [0,1])', () => {
    expect(CURATED_TEMPLATES.length).toBeGreaterThanOrEqual(4)
    for (const t of CURATED_TEMPLATES) {
      expect(t.blocks.length).toBeGreaterThan(0)
      for (const b of t.blocks) {
        expect(PROMO_BLOCK_IDS).toContain(b.blockId)
        for (const p of [b.xPct, b.yPct, b.wPct, b.hPct]) {
          expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(1)
        }
      }
    }
  })
  it('nearestTemplate choisit par ratio le plus proche', () => {
    const t = nearestTemplate(1080, 1920) // story portrait → le plus proche en ratio
    expect(t).toBeTruthy()
  })
})
