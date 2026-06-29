import { Group, Rect, Textbox, Shadow } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = []

const def: PromoBlockDef = {
  id: 'accroche',
  label: 'Accroche produit',
  conditionalRules: rules,
  build({ x, y, w, h, palette, fontFamily }) {
    // Bandeau d'accroche : pavé accent arrondi + ombre douce, nom produit en blanc.
    const band = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: Math.min(18, h * 0.18),
      ry: Math.min(18, h * 0.18),
      fill: palette.accent,
      shadow: new Shadow({ color: 'rgba(15,23,42,0.18)', blur: 18, offsetX: 0, offsetY: 6 }),
    })
    const fontSize = Math.min(h * 0.42, (w / Math.max(8, 12)) * 1.6)
    const title = new Textbox('{{promo_name}}', {
      left: x + w * 0.06,
      top: y + h * 0.5 - fontSize * 0.62,
      width: w * 0.88,
      fontSize,
      fontWeight: '700',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily,
      lineHeight: 1.0,
      scaleX: 1,
    })
    const g = new Group([band, title], { subTargetCheck: true, interactive: false })
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
