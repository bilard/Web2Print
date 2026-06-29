import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  { id: 'bandeau-lot-show', field: 'promo_lotText', operator: 'isNotEmpty', action: { type: 'show' } },
  { id: 'bandeau-lot-hide', field: 'promo_lotText', operator: 'isEmpty', action: { type: 'hide' } },
]

const def: PromoBlockDef = {
  id: 'bandeau-lot',
  label: 'Bandeau offre lot',
  conditionalRules: rules,
  build({ x, y, w, h, palette }) {
    // Pilule accent arrondie.
    const pill = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: h / 2,
      ry: h / 2,
      fill: palette.accent,
    })
    const txt = new Textbox('{{promo_lotText}}', {
      left: x,
      top: y + h * 0.5 - h * 0.27,
      width: w,
      fontSize: h * 0.46,
      fontWeight: '700',
      textAlign: 'center',
      charSpacing: 100,
      fill: '#ffffff',
      fontFamily: 'Oswald',
      lineHeight: 1.0,
      scaleX: 1,
    })
    const g = new Group([pill, txt], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
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
