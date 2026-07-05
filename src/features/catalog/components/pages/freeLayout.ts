// src/features/catalog/components/pages/freeLayout.ts
// Repli + fusion de la disposition libre (mode `cardStyle.freeLayout`).
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS } from '../../catalogTypes'

/**
 * Positions de repli (%) — CALQUÉES sur le rendu AUTO d'une carte verticale
 * (image en haut, textes empilés, réf/unité en bas à gauche · prix en bas à
 * droite). Sert de point de départ si la capture du rendu auto échoue (ou après
 * « Réinitialiser les positions ») : cocher « libre » ressemble alors à l'auto.
 */
export const FREE_DEFAULT_LAYOUT: Record<CardObjectId, CardBox> = {
  promo: { x: 0, y: 0, w: 100 },
  vedette: { x: 62, y: 3 },
  kicker: { x: 0, y: 2 },
  image: { x: 2, y: 4, w: 96, h: 57 },
  sticker: { x: 72, y: 30 },
  brand: { x: 5, y: 63, w: 90 },
  name: { x: 5, y: 67, w: 92 },
  description: { x: 5, y: 74, w: 92 },
  details: { x: 5, y: 81, w: 92, h: 8 },
  ref: { x: 5, y: 90, w: 45 },
  unit: { x: 5, y: 94, w: 45 },
  price: { x: 60, y: 85, w: 36 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}

/** Sélecteur du rendu AUTO (flux) de chaque objet — pour capturer sa position. */
const AUTO_SELECTORS: Record<CardObjectId, string> = {
  promo: '.cat-cell-promo',
  vedette: '.cat-cell-vedette',
  kicker: '.cat-cell-kicker',
  image: '.cat-cell-img',
  sticker: '.cat-price-sticker',
  brand: '.cat-cell-brand',
  name: '.cat-cell-name',
  description: '.cat-cell-desc',
  details: '.cat-cell-details',
  ref: '.cat-cell-refcode',
  unit: '.cat-cell-unit',
  price: '.cat-cell-pricebox',
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Capture la position (en % de la carte) de chaque objet du rendu AUTO d'une
 * carte. Sert à AMORCER la disposition libre : au moment où l'on coche « libre »
 * (la carte est encore rendue en auto), on fige ces positions dans `layout` →
 * la carte reste IDENTIQUE au rendu auto, puis l'utilisateur déplace les blocs.
 * `h` n'est capturée que pour l'image et les détails (bornées) ; les textes
 * gardent leur hauteur naturelle.
 */
export function measureAutoLayout(card: HTMLElement): Partial<Record<CardObjectId, CardBox>> {
  const cr = card.getBoundingClientRect()
  if (!cr.width || !cr.height) return {}
  const out: Partial<Record<CardObjectId, CardBox>> = {}
  for (const id of CARD_OBJECT_IDS) {
    const el = card.querySelector<HTMLElement>(AUTO_SELECTORS[id])
    if (!el) continue
    const er = el.getBoundingClientRect()
    if (!er.width || !er.height) continue
    const box: CardBox = {
      x: r1(((er.left - cr.left) / cr.width) * 100),
      y: r1(((er.top - cr.top) / cr.height) * 100),
      w: r1((er.width / cr.width) * 100),
    }
    if (id === 'image' || id === 'details') box.h = r1((er.height / cr.height) * 100)
    out[id] = box
  }
  return out
}
