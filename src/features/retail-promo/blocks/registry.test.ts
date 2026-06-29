import { describe, it, expect } from 'vitest'
// L'import de l'index déclenche l'enregistrement des 8 blocs par effet de bord.
import './index'
import { listPromoBlocks, getPromoBlock, initPromoBlocks } from './index'
import { PROMO_BLOCK_IDS } from '../promoPlan'

describe('registry des blocs promo', () => {
  it('enregistre exactement les 8 blocs de PROMO_BLOCK_IDS', () => {
    const ids = listPromoBlocks().map((b) => b.id).sort()
    expect(ids).toEqual([...PROMO_BLOCK_IDS].sort())
  })

  it('badge-remise a une règle conditionnelle sur promo_remisePct', () => {
    const def = getPromoBlock('badge-remise')!
    expect(def).toBeTruthy()
    const rule = def.conditionalRules.find(
      (r) => r.action.type === 'hide' || r.action.type === 'show',
    )
    expect(rule).toBeTruthy()
    expect(rule!.field).toBe('promo_remisePct')
  })

  it('prix-barre a une règle sur promo_oldPrice (masque le prix barré)', () => {
    const def = getPromoBlock('prix-barre')!
    expect(def.conditionalRules.some((r) => r.field === 'promo_oldPrice')).toBe(true)
  })

  it('cadre-photo a une règle setOpacity et un champ promo_image', () => {
    const def = getPromoBlock('cadre-photo')!
    const rule = def.conditionalRules.find((r) => r.action.type === 'setOpacity')
    expect(rule).toBeTruthy()
    expect(rule!.field).toBe('promo_image')
  })

  it('bandeau-lot, bandeau-validite, mentions ont des règles isNotEmpty/isEmpty', () => {
    for (const blockId of ['bandeau-lot', 'bandeau-validite', 'mentions'] as const) {
      const def = getPromoBlock(blockId)!
      expect(def.conditionalRules.some((r) => r.operator === 'isNotEmpty')).toBe(true)
      expect(def.conditionalRules.some((r) => r.operator === 'isEmpty')).toBe(true)
    }
  })

  it("badge-statut et accroche n'ont aucune règle", () => {
    expect(getPromoBlock('badge-statut')!.conditionalRules).toHaveLength(0)
    expect(getPromoBlock('accroche')!.conditionalRules).toHaveLength(0)
  })

  it('initPromoBlocks est idempotent (no-op)', () => {
    initPromoBlocks()
    expect(listPromoBlocks()).toHaveLength(PROMO_BLOCK_IDS.length)
  })
})
