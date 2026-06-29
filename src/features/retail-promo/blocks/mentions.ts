import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  {
    id: 'mentions-show',
    field: 'promo_mentions',
    operator: 'isNotEmpty',
    action: { type: 'show' },
  },
  {
    id: 'mentions-hide',
    field: 'promo_mentions',
    operator: 'isEmpty',
    action: { type: 'hide' },
  },
]

const def: PromoBlockDef = {
  id: 'mentions',
  label: 'Mentions légales',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    // Fond transparent : les mentions se lisent sur le fond de page.
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: 'transparent',
    })
    const txt = new Textbox('{{promo_mentions}}', {
      left: x,
      top: y + h * 0.1,
      width: w,
      fontSize: Math.max(8, h * 0.28),
      fontWeight: '400',
      textAlign: 'left',
      fill: palette.text,
      fontFamily,
      scaleX: 1,
    })
    const g = new Group([bg, txt], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_mentions_${Date.now()}`,
      type: 'promo-block',
      blockId: 'mentions',
      conditionalRules: rules,
    }
    return g
  },
}

registerPromoBlock(def)
