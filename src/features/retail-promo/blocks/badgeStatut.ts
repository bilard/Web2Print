import { Group, Rect, Textbox } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = []

const def: PromoBlockDef = {
  id: 'badge-statut',
  label: 'Badge statut (NOUVEAU…)',
  conditionalRules: rules,
  build({ x, y, w, h, palette }) {
    const bg = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: h / 2,
      ry: h / 2,
      fill: palette.accent,
    })
    // Texte fixe éditable — l'utilisateur peut le modifier dans l'éditeur.
    const txt = new Textbox('NOUVEAU', {
      left: x,
      top: y + h * 0.5 - h * 0.26,
      width: w,
      fontSize: h * 0.46,
      fontWeight: '700',
      textAlign: 'center',
      charSpacing: 150,
      fill: '#ffffff',
      fontFamily: 'Oswald',
      lineHeight: 1.0,
      scaleX: 1,
    })
    const g = new Group([bg, txt], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
    g.data = {
      id: `promo_badge-statut_${Date.now()}`,
      type: 'promo-block',
      blockId: 'badge-statut',
      conditionalRules: [],
    }
    return g
  },
}

registerPromoBlock(def)
