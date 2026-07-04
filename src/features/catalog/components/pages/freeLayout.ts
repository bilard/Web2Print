// src/features/catalog/components/pages/freeLayout.ts
// Repli + fusion de la disposition libre (mode `cardStyle.freeLayout`).
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'

/** Positions de repli (%) approximant le flux — une fiche passée en libre n'est jamais cassée. */
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 2, y: 1, w: 96 },
  image: { x: 8, y: 8, w: 84, h: 44 },
  sticker: { x: 78, y: 40 },
  kicker: { x: 2, y: 9 },
  vedette: { x: 62, y: 1 },
  brand: { x: 6, y: 55, w: 88 },
  name: { x: 6, y: 60, w: 88 },
  description: { x: 6, y: 69, w: 88 },
  ref: { x: 6, y: 84, w: 50 },
  unit: { x: 6, y: 89, w: 50 },
  price: { x: 58, y: 82, w: 38 },
  details: { x: 6, y: 94, w: 88 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}
