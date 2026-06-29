import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  { id: 'bandeau-validite-show', field: 'promo_validText', operator: 'isNotEmpty', action: { type: 'show' } },
  { id: 'bandeau-validite-hide', field: 'promo_validText', operator: 'isEmpty', action: { type: 'hide' } },
]

const def: PromoBlockDef = {
  id: 'bandeau-validite',
  label: 'Bandeau dates de validité',
  conditionalRules: rules,
  build({ x, y, w, h, fontFamily }) {
    // Ligne discrète (pas de pavé) : ancre transparente pour la géométrie + texte muté.
    const anchor = new Rect({ left: x, top: y, width: w, height: h, fill: 'transparent' })
    const txt = new Textbox('{{promo_validText}}', {
      left: x,
      top: y + h * 0.5 - h * 0.32,
      width: w,
      fontSize: h * 0.6,
      fontWeight: '600',
      textAlign: 'center',
      charSpacing: 50,
      fill: 'rgba(15,23,42,0.55)',
      fontFamily,
      lineHeight: 1.0,
      scaleX: 1,
    })
    const g = new Group([anchor, txt], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_bandeau-validite_${Date.now()}`,
      type: 'promo-block',
      blockId: 'bandeau-validite',
      conditionalRules: rules,
    }
    return g
  },
}

registerPromoBlock(def)
