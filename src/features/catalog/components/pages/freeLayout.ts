// src/features/catalog/components/pages/freeLayout.ts
// Repli + fusion de la disposition libre (mode `cardStyle.freeLayout`).
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'

/** Positions de repli (%) approximant le flux — une fiche passée en libre n'est jamais cassée. */
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 3, y: 2, w: 94 },
  image: { x: 10, y: 12, w: 80, h: 40 },
  sticker: { x: 80, y: 44 },
  kicker: { x: 3, y: 12 },
  vedette: { x: 66, y: 2 },
  brand: { x: 5, y: 55, w: 90 },
  name: { x: 5, y: 60, w: 90 },
  description: { x: 5, y: 68, w: 90 },
  ref: { x: 5, y: 82, w: 45 },
  price: { x: 55, y: 80, w: 40 },
  unit: { x: 5, y: 88, w: 45 },
  details: { x: 5, y: 93, w: 90 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}
