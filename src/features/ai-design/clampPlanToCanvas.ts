/**
 * Clamp déterministe des bboxes d'un DesignPlan aux bornes du canvas.
 *
 * Le LLM (Art Director + Critic) produit régulièrement des zones qui débordent :
 *  - titres qui sortent à gauche (x négatif),
 *  - CTA placés en y > heightMm,
 *  - rectangles de fond oversized.
 *
 * Cette fonction applique une politique simple et prévisible :
 *  - Les rôles structurels qui couvrent le fond (`background`, `accent` sans contenu,
 *    `logo-slot`) peuvent déborder jusqu'au bleed (coordonnées négatives autorisées
 *    dans `[-bleedMm, widthMm + bleedMm]`).
 *  - Toutes les autres zones (texte, CTA, prix, badge avec contenu) sont ramenées
 *    dans la zone imprimée stricte `[0, widthMm] × [0, heightMm]`, avec une marge
 *    de sécurité de 3 mm quand possible.
 *
 * Le clamp préserve la largeur/hauteur quand c'est possible (on translate plutôt que
 * shrinker) ; s'il ne rentre vraiment pas, on shrinke.
 */

import type { DesignPlan } from './artDirectorSchema'

const SAFETY_MARGIN_MM = 3

interface Bbox {
  x: number
  y: number
  w: number
  h: number
}

interface ClampArgs {
  widthMm: number
  heightMm: number
  bleedMm: number
}

type ZoneRole = DesignPlan['zones'][number]['role']

/** Rôles qui peuvent déborder jusqu'au bleed (fonds, cadres décoratifs). */
function allowsBleed(role: ZoneRole, hasContent: boolean): boolean {
  if (role === 'background') return true
  if (role === 'accent' && !hasContent) return true
  return false
}

function clampBbox(bbox: Bbox, args: ClampArgs, allowBleed: boolean, label: string): {
  bbox: Bbox
  changed: boolean
} {
  const { widthMm, heightMm, bleedMm } = args
  const minX = allowBleed ? -bleedMm : SAFETY_MARGIN_MM
  const minY = allowBleed ? -bleedMm : SAFETY_MARGIN_MM
  const maxX = allowBleed ? widthMm + bleedMm : widthMm - SAFETY_MARGIN_MM
  const maxY = allowBleed ? heightMm + bleedMm : heightMm - SAFETY_MARGIN_MM

  let { x, y, w, h } = bbox
  let changed = false

  // Width/height doivent être positifs et ne pas dépasser la zone totale disponible.
  const availW = maxX - minX
  const availH = maxY - minY
  if (w > availW) {
    w = availW
    changed = true
  }
  if (h > availH) {
    h = availH
    changed = true
  }
  if (w < 1) {
    w = 1
    changed = true
  }
  if (h < 1) {
    h = 1
    changed = true
  }

  // Translate pour faire rentrer plutôt que shrinker.
  if (x < minX) {
    x = minX
    changed = true
  }
  if (y < minY) {
    y = minY
    changed = true
  }
  if (x + w > maxX) {
    x = maxX - w
    changed = true
  }
  if (y + h > maxY) {
    y = maxY - h
    changed = true
  }
  // Au cas où la translation aurait retraversé la borne gauche/haute.
  if (x < minX) x = minX
  if (y < minY) y = minY

  if (changed) {
    console.warn(
      `[clampPlan] ${label} clampé : (${bbox.x.toFixed(1)},${bbox.y.toFixed(1)} ${bbox.w.toFixed(1)}×${bbox.h.toFixed(1)}) → (${x.toFixed(1)},${y.toFixed(1)} ${w.toFixed(1)}×${h.toFixed(1)})`,
    )
  }

  return { bbox: { x, y, w, h }, changed }
}

export function clampPlanToCanvas(plan: DesignPlan, args: ClampArgs): DesignPlan {
  const zones = plan.zones.map((zone) => {
    const hasContent = !!zone.content && zone.content.trim() !== ''
    const { bbox } = clampBbox(zone.bboxMm, args, allowsBleed(zone.role, hasContent), `zone "${zone.id}" (${zone.role})`)
    return { ...zone, bboxMm: bbox }
  })

  // Les slots images sont tous traités comme "zone imprimée stricte" — pas de
  // bleed autorisé (une image qui déborde au coupe n'est jamais voulu).
  const slots = plan.slots.map((slot) => {
    const { bbox } = clampBbox(slot.bboxMm, args, false, `slot "${slot.id}" (${slot.role})`)
    return { ...slot, bboxMm: bbox }
  })

  return { ...plan, zones, slots }
}
