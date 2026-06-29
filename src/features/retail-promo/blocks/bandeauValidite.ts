import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  {
    id: 'bandeau-validite-show',
    field: 'promo_validText',
    operator: 'isNotEmpty',
    action: { type: 'show' },
  },
  {
    id: 'bandeau-validite-hide',
    field: 'promo_validText',
    operator: 'isEmpty',
    action: { type: 'hide' },
  },
]

const def: PromoBlockDef = {
  id: 'bandeau-validite',
  label: 'Bandeau dates de validité',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: palette.text,
    })
    const txt = new Textbox('{{promo_validText}}', {
      left: x,
      top: y + h * 0.22,
      width: w,
      fontSize: h * 0.5,
      fontWeight: '600',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      scaleX: 1,
    })
    const g = new Group([bg, txt], { subTargetCheck: true, interactive: false })
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
