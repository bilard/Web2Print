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
  image: { x: 2, y: 4, w: 96, h: 42 },
  sticker: { x: 70, y: 24 },
  brand: { x: 5, y: 48, w: 90 },
  name: { x: 5, y: 52, w: 92 },
  description: { x: 5, y: 58, w: 92 },
  // Bas de carte en DEUX COLONNES : détails SANS hauteur imposée (textes entiers,
  // jamais coupés) à GAUCHE, réf/unité dessous · prix À DROITE (y74 pour qu'un
  // badge prix agrandi ×2 — barré + prix empilés — ne soit PAS coupé en bas).
  details: { x: 5, y: 68, w: 48 },
  ref: { x: 5, y: 88, w: 45 },
  unit: { x: 5, y: 92, w: 45 },
  price: { x: 56, y: 74, w: 40 },
}

/** Boîte effective d'un objet : override utilisateur (layout) fusionné sur le repli. */
export function freeLayoutBox(id: CardObjectId, style: CatalogCardStyle): CardBox {
  return { ...FREE_DEFAULT_LAYOUT[id], ...(style.layout?.[id] ?? {}) }
}

/**
 * Chaîne de FLUX VERTICAL AIMANTÉ : ces objets texte ne se superposent JAMAIS.
 * Triés par leur y configuré (parent au-dessus > enfant en dessous), chaque bloc
 * POUSSE vers le bas ceux qui le chevauchent, selon la hauteur RÉELLE de son
 * contenu (volumétrie). Deux blocs sans recouvrement horizontal (ex. détails à
 * gauche · prix à droite) restent indépendants. L'image/badges ne poussent pas.
 */
export const FLOW_CHAIN: CardObjectId[] = ['brand', 'name', 'description', 'details', 'ref', 'unit']

/** Écart (px) entre deux blocs aimantés (collés à cette distance). */
const MAGNET_GAP = 6

/**
 * Applique l'aimantation sur une carte RENDUE (aperçu, pages du catalogue et
 * export partagent ce même calcul → résultat identique partout). Réinitialise
 * d'abord les `top` configurés (idempotent), puis cascade les poussées.
 */
/** Un bloc est-il aimanté ? Réglage PAR BLOC (`box.m`), sinon défaut global. */
export function isMagnetized(box: CardBox, style: CatalogCardStyle): boolean {
  return box.m ?? (style.magnetFlow ?? true)
}

export function applyMagneticFlow(card: HTMLElement, style: CatalogCardStyle): void {
  const cardH = card.clientHeight
  const cardW = card.clientWidth
  if (!cardH || !cardW) return
  const items = FLOW_CHAIN
    .map((id) => {
      const el = card.querySelector<HTMLElement>(`.cat-obj[data-object-id="${id}"]`)
      return el ? { el, box: freeLayoutBox(id, style) } : null
    })
    .filter((x): x is { el: HTMLElement; box: CardBox } => x != null)
    .sort((a, b) => a.box.y - b.box.y)
  for (const it of items) it.el.style.top = `${it.box.y}%` // repart du configuré (mesures stables)
  const placed: { x1: number; x2: number; bottom: number }[] = []
  for (const it of items) {
    const x1 = it.box.x
    const x2 = it.box.x + (it.box.w ?? (it.el.offsetWidth / cardW) * 100)
    // COLLÉ (aimant dans les deux sens) au bloc du dessus qui le chevauche
    // horizontalement : contenu court = l'enfant REMONTE (pas de trou), contenu
    // long = l'enfant est POUSSÉ (pas de superposition). Réglage PAR BLOC :
    // un bloc détaché (m=false) reste EXACTEMENT à sa position configurée —
    // mais sert toujours de parent aux blocs aimantés qui le suivent.
    let snap: number | null = null
    if (isMagnetized(it.box, style)) {
      for (const p of placed) {
        if (x1 < p.x2 && p.x1 < x2) snap = Math.max(snap ?? -Infinity, p.bottom + MAGNET_GAP)
      }
    }
    const top = snap ?? (it.box.y / 100) * cardH
    it.el.style.top = `${Math.round((top / cardH) * 1000) / 10}%`
    placed.push({ x1, x2, bottom: top + it.el.offsetHeight })
  }
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
 * `h` n'est capturée que pour l'image (boîte remplie) ; textes ET détails gardent
 * leur hauteur naturelle — en libre, les textes ne sont jamais coupés.
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
    if (id === 'image') box.h = r1((er.height / cr.height) * 100)
    out[id] = box
  }
  return out
}
