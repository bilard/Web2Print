// src/features/catalog/components/pages/freeLayout.ts
// Repli + fusion de la disposition libre (mode `cardStyle.freeLayout`).
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'

/**
 * Positions de repli (%) — carte structurée sans chevauchement par défaut :
 * bandeau haut, image, textes empilés, puis rangée basse (réf/unité À GAUCHE ·
 * prix À DROITE) et détails tout en bas pleine largeur, avec un écart net entre
 * le bloc prix (haut) et les détails (bas) pour éviter les collisions.
 */
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 3, y: 2, w: 94 },
  vedette: { x: 64, y: 2 },
  kicker: { x: 3, y: 11 },
  image: { x: 10, y: 11, w: 80, h: 30 },
  sticker: { x: 82, y: 36 },
  brand: { x: 5, y: 45, w: 60 },
  name: { x: 5, y: 49, w: 90 },
  description: { x: 5, y: 57, w: 90 },
  ref: { x: 5, y: 70, w: 48 },
  unit: { x: 5, y: 76, w: 48 },
  price: { x: 55, y: 67, w: 42 },
  details: { x: 5, y: 88, w: 90 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}
