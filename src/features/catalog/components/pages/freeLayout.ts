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
  image: { x: 22, y: 11, w: 56, h: 30 },
  sticker: { x: 78, y: 34 },
  brand: { x: 5, y: 45, w: 60 },
  name: { x: 5, y: 49, w: 90 },
  description: { x: 5, y: 55, w: 90 },
  // Bas de carte = DEUX COLONNES qui ne se chevauchent JAMAIS :
  // colonne GAUCHE (réf, unité, détails) x5→55 · colonne DROITE (prix) x56→96.
  // `details.h` borne la hauteur → le bloc se coupe proprement (overflow hidden,
  // cf. catalogCss) au lieu de déborder hors de la carte.
  ref: { x: 5, y: 65, w: 50 },
  unit: { x: 5, y: 69, w: 50 },
  details: { x: 5, y: 74, w: 50, h: 24 },
  price: { x: 56, y: 65, w: 40 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}
