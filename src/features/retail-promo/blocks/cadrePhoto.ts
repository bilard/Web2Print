import { FabricImage, Group, Rect } from 'fabric'
import type { ConditionalRule } from '@/features/merge/conditionalRules'
import { registerPromoBlock } from './registry'
import type { PromoBlockDef } from './types'

// PNG 1×1 transparent pour le placeholder HTMLImageElement.
const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Quand promo_image est vide : on rend le bloc semi-transparent (placeholder discret).
const opacityRule: ConditionalRule = {
  id: 'cadre-photo-dim',
  field: 'promo_image',
  operator: 'isEmpty',
  action: { type: 'setOpacity', opacity: 0.15 },
}

const rules: ConditionalRule[] = [opacityRule]

const def: PromoBlockDef = {
  id: 'cadre-photo',
  label: 'Cadre photo produit',
  conditionalRules: rules,
  build({ x, y, w, h }) {
    // Fond gris clair — visible quand pas d'image (combiné avec l'opacité 0.15).
    const placeholder = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      fill: '#cccccc',
    })

    // FabricImage synchrone depuis un élément HTMLImageElement.
    // Le moteur de publipostage remplace src à la fusion via data.bindings.src.
    const el = new Image()
    el.src = TRANSPARENT_PNG
    const img = new FabricImage(el, {
      left: x,
      top: y,
      width: w,
      height: h,
      scaleX: 1,
      scaleY: 1,
    })
    img.data = {
      bindings: { src: 'promo_image' },
    }

    // La règle d'opacité est sur le GROUP : c'est l'ensemble du bloc qui s'atténue.
    const g = new Group([placeholder, img], { subTargetCheck: true, interactive: false })
    g.data = {
      id: `promo_cadre-photo_${Date.now()}`,
      type: 'promo-block',
      blockId: 'cadre-photo',
      conditionalRules: rules,
    }
    return g
  },
}

registerPromoBlock(def)
