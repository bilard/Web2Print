import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  {
    id: 'bandeau-lot-show',
    field: 'promo_lotText',
    operator: 'isNotEmpty',
    action: { type: 'show' },
  },
  {
    id: 'bandeau-lot-hide',
    field: 'promo_lotText',
    operator: 'isEmpty',
    action: { type: 'hide' },
  },
]

const def: PromoBlockDef = {
  id: 'bandeau-lot',
  label: 'Bandeau offre lot',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: palette.primary,
    })
    const txt = new Textbox('{{promo_lotText}}', {
      left: x,
      top: y + h * 0.22,
      width: w,
      fontSize: h * 0.52,
      fontWeight: '700',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      scaleX: 1,
    })
    const g = new Group([bg, txt], { subTargetCheck: true, interactive: false })
    g.data = {
      id: `promo_bandeau-lot_${Date.now()}`,
      type: 'promo-block',
      blockId: 'bandeau-lot',
      conditionalRules: rules,
    }
    return g
  },
}

registerPromoBlock(def)
