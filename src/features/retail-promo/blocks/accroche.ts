import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = []

const def: PromoBlockDef = {
  id: 'accroche',
  label: 'Accroche produit',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    // Fond transparent : le titre se superpose au fond de page.
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: 'transparent',
    })
    const title = new Textbox('{{promo_name}}', {
      left: x,
      top: y + h * 0.15,
      width: w,
      fontSize: h * 0.6,
      fontWeight: '700',
      textAlign: 'center',
      fill: palette.text,
      fontFamily,
      scaleX: 1,
    })
    const g = new Group([bg, title], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_accroche_${Date.now()}`,
      type: 'promo-block',
      blockId: 'accroche',
      conditionalRules: [],
    }
    return g
  },
}

registerPromoBlock(def)
