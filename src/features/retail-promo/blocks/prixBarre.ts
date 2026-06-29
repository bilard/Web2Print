import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

// La règle masque uniquement le texte barré (WAS) — le NOW reste toujours affiché.
// Portée : child-level (prixWas.data.conditionalRules).
// applyConditionalRulesForRow parcourt collectObjectsDeep → le child voit ses règles.
const wasRule: ConditionalRule = {
  id: 'prix-barre-was-hide',
  field: 'promo_oldPrice',
  operator: 'isEmpty',
  action: { type: 'hide' },
}

const rules: ConditionalRule[] = [wasRule]

const def: PromoBlockDef = {
  id: 'prix-barre',
  label: 'Prix barré + prix actuel',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: palette.primary,
    })

    const prixWas = new Textbox('00,00 €', {
      left: x,
      top: y + h * 0.06,
      width: w,
      fontSize: h * 0.3,
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      scaleX: 1,
      linethrough: true,
    })
    // Échantillon court au build (token {{}} insécable déborderait la box) ;
    // la fusion résout via data.templateText.
    prixWas.data = { templateText: '{{promo_priceWas}}', conditionalRules: [wasRule] }

    const prixNow = new Textbox('00,00 €', {
      left: x,
      top: y + h * 0.44,
      width: w,
      fontSize: h * 0.48,
      fontWeight: '900',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      scaleX: 1,
    })
    prixNow.data = { templateText: '{{promo_priceNow}}' }

    const g = new Group([bg, prixWas, prixNow], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_prix-barre_${Date.now()}`,
      type: 'promo-block',
      blockId: 'prix-barre',
    }
    return g
  },
}

registerPromoBlock(def)
