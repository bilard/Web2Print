import { FabricImage, Group, Rect, Shadow } from 'fabric'
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
  action: { type: 'setOpacity', opacity: 0.25 },
}

const rules: ConditionalRule[] = [opacityRule]

const def: PromoBlockDef = {
  id: 'cadre-photo',
  label: 'Cadre photo produit',
  conditionalRules: rules,
  build({ x, y, w, h }) {
    const radius = Math.min(24, Math.min(w, h) * 0.06)
    // Cadre clair arrondi + bordure fine + ombre douce (visible sans image).
    const frame = new Rect({
      left: x,
      top: y,
      width: w,
      height: h,
      rx: radius,
      ry: radius,
      fill: '#f1f5f9',
      stroke: 'rgba(15,23,42,0.08)',
      strokeWidth: 1,
      shadow: new Shadow({ color: 'rgba(15,23,42,0.12)', blur: 16, offsetX: 0, offsetY: 6 }),
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
    const g = new Group([frame, img], { subTargetCheck: true, interactive: false })
    g.set({ originX: 'left', originY: 'top' })
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
