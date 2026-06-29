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

    const prixWas = new Textbox('{{promo_priceWas}}', {
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
    prixWas.data = { conditionalRules: [wasRule] }

    const prixNow = new Textbox('{{promo_priceNow}}', {
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

    const g = new Group([bg, prixWas, prixNow], { subTargetCheck: true, interactive: false })
    g.data = {
      id: `promo_prix-barre_${Date.now()}`,
      type: 'promo-block',
      blockId: 'prix-barre',
    }
    return g
  },
}

registerPromoBlock(def)
