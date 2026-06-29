import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  {
    id: 'badge-remise-show',
    field: 'promo_remisePct',
    operator: 'gt',
    value: '0',
    action: { type: 'show' },
  },
  {
    id: 'badge-remise-hide',
    field: 'promo_remisePct',
    operator: 'lte',
    value: '0',
    action: { type: 'hide' },
  },
]

const def: PromoBlockDef = {
  id: 'badge-remise',
  label: 'Badge remise (-X%)',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    const r = Math.min(w, h) / 2
    const disc = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: r,
      ry: r,
      fill: palette.accent,
    })
    const label = new Textbox('{{promo_remiseLabel}}', {
      left: x,
      top: y + h * 0.28,
      width: w,
      fontSize: h * 0.42,
      fontWeight: '900',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      scaleX: 1,
    })
    const g = new Group([disc, label], { subTargetCheck: true, interactive: false })
    g.data = {
      id: `promo_badge-remise_${Date.now()}`,
      type: 'promo-block',
      blockId: 'badge-remise',
      conditionalRules: rules,
    }
    return g
  },
}

registerPromoBlock(def)
