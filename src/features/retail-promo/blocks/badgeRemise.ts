import { Group, Circle, Textbox, Shadow } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

const rules: ConditionalRule[] = [
  { id: 'badge-remise-visible', field: 'promo_remiseLabel', operator: 'isNotEmpty', action: { type: 'show' } },
  { id: 'badge-remise-hidden',  field: 'promo_remiseLabel', operator: 'isEmpty',    action: { type: 'hide' } },
]

// Couleur soldes (rouge) propre au badge, indépendante de la palette de marque.
const BADGE_COLOR = '#e11d48'

const def: PromoBlockDef = {
  id: 'badge-remise',
  label: 'Badge remise (-X%)',
  conditionalRules: rules,
  build({ x, y, w, h }) {
    const r = Math.min(w, h) / 2
    const cx = x + w / 2
    const cy = y + h / 2

    // Sceau : disque rouge + ombre.
    const disc = new Circle({
      left: cx - r,
      top: cy - r,
      radius: r,
      fill: BADGE_COLOR,
      shadow: new Shadow({ color: 'rgba(225,29,72,0.35)', blur: 18, offsetX: 0, offsetY: 6 }),
    })
    // Anneau intérieur blanc fin (look « tampon »).
    const ring = new Circle({
      left: cx - r * 0.82,
      top: cy - r * 0.82,
      radius: r * 0.82,
      fill: 'transparent',
      stroke: 'rgba(255,255,255,0.85)',
      strokeWidth: Math.max(1.5, r * 0.04),
    })
    // « -28% » en Oswald, dominant.
    const label = new Textbox('-00%', {
      left: cx - r,
      top: cy - r * 0.5,
      width: r * 2,
      fontSize: r * 0.62,
      fontWeight: '700',
      textAlign: 'center',
      fill: '#ffffff',
      fontFamily: 'Oswald',
      lineHeight: 1.0,
      scaleX: 1,
    })
    label.data = { templateText: '{{promo_remiseLabel}}' }
    // Sous-titre « de remise ».
    const sub = new Textbox('de remise', {
      left: cx - r,
      top: cy + r * 0.18,
      width: r * 2,
      fontSize: r * 0.16,
      fontWeight: '700',
      textAlign: 'center',
      charSpacing: 200,
      fill: 'rgba(255,255,255,0.9)',
      fontFamily: 'Montserrat',
      scaleX: 1,
    })

    const g = new Group([disc, ring, label, sub], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
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
