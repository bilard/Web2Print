import { describe, it, expect } from 'vitest'
import { Group, FabricImage, Textbox } from 'fabric'
// L'import de l'index déclenche l'enregistrement des 8 blocs par effet de bord.
import './index'
import { listPromoBlocks, getPromoBlock, initPromoBlocks } from './index'
import { PROMO_BLOCK_IDS } from '../promoPlan'

/** Contexte minimal pour les smoke tests build(). */
const BUILD_CTX = {
  x: 10, y: 20, w: 200, h: 100,
  palette: { primary: '#333333', accent: '#6366f1', text: '#ffffff' },
  fontFamily: 'Arial',
  resolvedTheme: 'dark' as const,
}

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

// ---------------------------------------------------------------------------
// Smoke tests build() — vérifient que la construction Fabric fonctionne en jsdom
// et que les contrats runtime (data.conditionalRules, data.bindings) sont respectés.
// ---------------------------------------------------------------------------
describe('build() smoke tests', () => {
  it('bandeau-lot: build() retourne un Group avec data.conditionalRules non vide', () => {
    const def = getPromoBlock('bandeau-lot')!
    const obj = def.build(BUILD_CTX)
    expect(obj).toBeInstanceOf(Group)
    const g = obj as Group
    expect(Array.isArray(g.data?.conditionalRules)).toBe(true)
    expect((g.data!.conditionalRules as unknown[]).length).toBeGreaterThan(0)
  })

  it('cadre-photo: build() expose un enfant FabricImage avec data.bindings.src = promo_image', () => {
    const def = getPromoBlock('cadre-photo')!
    const g = def.build(BUILD_CTX) as Group
    expect(g).toBeInstanceOf(Group)
    const imgChild = g.getObjects().find((c) => c instanceof FabricImage)
    expect(imgChild).toBeTruthy()
    expect((imgChild as FabricImage).data?.bindings).toEqual({ src: 'promo_image' })
  })

  it('prix-barre: group sans conditionalRules ; enfant WAS porte la règle isEmpty', () => {
    const def = getPromoBlock('prix-barre')!
    const g = def.build(BUILD_CTX) as Group
    // Le GROUP ne porte pas de règles (prixNow doit rester visible)
    expect(g.data?.conditionalRules).toBeUndefined()
    // L'enfant prixWas (Textbox avec linethrough) porte la règle child-level
    const wasChild = g.getObjects().find(
      (c) => c instanceof Textbox && Array.isArray((c as Textbox).data?.conditionalRules),
    )
    expect(wasChild).toBeTruthy()
    const rules = (wasChild as Textbox).data!.conditionalRules as Array<{ operator: string }>
    expect(rules.some((r) => r.operator === 'isEmpty')).toBe(true)
  })

  it('sanité coordonnées : g.left ≈ ctx.x (±1 px)', () => {
    // Vérifie que le patron « enfants en coords absolues, pas de left/top sur le Group »
    // positionne correctement le groupe. Note : g.top peut varier de ±5 px
    // à cause des métriques de police jsdom (canvas mock sans mesure réelle).
    const def = getPromoBlock('bandeau-lot')!
    const g = def.build(BUILD_CTX) as Group
    expect(Math.abs(g.left - BUILD_CTX.x)).toBeLessThan(1)
  })
})
