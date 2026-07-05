// src/features/catalog/components/pages/freeLayout.ts
// Repli + fusion + moteur (aimant/liaisons) de la disposition libre — LE mode de
// rendu des fiches produit.
import type { CardBox, CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { CARD_OBJECT_IDS } from '../../catalogTypes'

/**
 * Positions de repli (%) — le design COMPLET d'une carte verticale (image en
 * haut, textes empilés, réf/unité soudées en bas à gauche · prix ancré en bas à
 * droite). C'est la fiche par défaut, et le point de retour de
 * « Réinitialiser les positions ».
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
  // Design COMPLET calqué sur l'auto : détails pleine largeur (aimantés sous la
  // description), réf en bas à gauche avec l'unité SOUDÉE à sa droite (liaison),
  // prix ANCRÉ bas-droite (mise en page liquide) → identique sur toutes les cartes.
  details: { x: 5, y: 68, w: 92 },
  ref: { x: 5, y: 90, w: 45 },
  unit: { x: 5, y: 94, link: 'ref' },
  price: { x: 2, y: 2, w: 40, ax: 'r', ay: 'b' },
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
  const objOf = (id: CardObjectId) => card.querySelector<HTMLElement>(`.cat-obj[data-object-id="${id}"]`)
  // Liens VALIDES (garde-fou anti-CYCLE) : un lien dont la chaîne de cibles
  // reboucle sur lui-même (ex. réf↔unité liées l'une à l'autre) est IGNORÉ —
  // sinon chaque bloc se soude à droite de l'autre et les positions divergent à
  // chaque rendu. Le premier lien déclaré (ordre CARD_OBJECT_IDS) gagne.
  const validLink = new Map<CardObjectId, CardObjectId>()
  for (const id of CARD_OBJECT_IDS) {
    const t = freeLayoutBox(id, style).link
    if (!t || t === id) continue
    let cur: CardObjectId | undefined = t
    while (cur && cur !== id) cur = validLink.get(cur)
    if (cur !== id) validLink.set(id, t)
  }
  // ── OBSTACLES : les blocs HORS CHAÎNE (prix ancré bas par défaut — mais aussi
  // un prix DÉSANCRÉ par un drag, badges…) sont des PLAFONDS pour la chaîne de
  // flux. Les cartes du catalogue n'ont pas le ratio de la carte d'aperçu
  // (grilles larges/courtes, typo --cat-fit plus grosse) : sans plafond, les
  // textes glissent SOUS le prix et se superposent. Ici ils se coupent proprement
  // AU-DESSUS (maxHeight + overflow). Seuls les obstacles situés EN DESSOUS du
  // bloc courant plafonnent (le kicker en haut ne coupe pas la pile de textes).
  const obstacles: { x1: number; x2: number; top: number }[] = []
  for (const id of CARD_OBJECT_IDS) {
    if (id === 'image' || id === 'promo' || FLOW_CHAIN.includes(id)) continue
    const b = freeLayoutBox(id, style)
    if (validLink.has(id)) continue
    const el = objOf(id)
    if (!el) continue
    const sc = b.sc ?? 1
    const h = el.offsetHeight * sc
    // Largeur du CONTENU (badge rendu), pas de la boîte (souvent bien plus large,
    // ex. prix w:40 aligné à droite) — sinon le plafond coupe des colonnes entières.
    const inner = el.firstElementChild as HTMLElement | null
    const wPct = (((inner?.offsetWidth || el.offsetWidth) * sc) / cardW) * 100
    const ax = b.ax ?? 'l'
    const x2 = ax === 'r' ? 100 - b.x : ax === 'c' ? 50 + wPct / 2 : b.x + wPct
    const ay = b.ay ?? 't'
    // Anticipe le CLAMP final : un bloc désancré posé trop bas sera remonté au ras.
    const top = ay === 'b' ? cardH - (b.y / 100) * cardH - h
      : ay === 'c' ? cardH / 2 - h / 2
      : Math.min((b.y / 100) * cardH, cardH - h)
    obstacles.push({ x1: x2 - wPct, x2, top })
  }
  const ceilingFor = (x1: number, x2: number, top: number): number => {
    let c = cardH
    for (const o of obstacles) if (o.top > top && x1 < o.x2 && o.x1 < x2) c = Math.min(c, o.top - MAGNET_GAP)
    return c
  }
  const items = FLOW_CHAIN
    .map((id) => {
      const el = objOf(id)
      return el ? { id, el, box: freeLayoutBox(id, style) } : null
    })
    .filter((x): x is { id: CardObjectId; el: HTMLElement; box: CardBox } => x != null)
    // Un bloc ANCRÉ au bas/centre (mise en page liquide) ou LIÉ à un autre bloc
    // sort de la chaîne : il est positionné par son bord / sa cible. Un lien
    // annulé (cycle) rend le bloc à la chaîne verticale.
    .filter((x) => (x.box.ay ?? 't') === 't' && !validLink.has(x.id))
    .sort((a, b) => a.box.y - b.box.y)
  for (const it of items) {
    it.el.style.top = `${it.box.y}%` // repart du configuré (mesures stables)
    it.el.style.maxHeight = ''
    it.el.style.overflow = ''
  }
  const spanOf = (it: { el: HTMLElement; box: CardBox }): [number, number] =>
    [it.box.x, it.box.x + (it.box.w ?? (it.el.offsetWidth / cardW) * 100)]
  const placed: { x1: number; x2: number; bottom: number }[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const [x1, x2] = spanOf(it)
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
    // RÉSERVE : place des blocs aimantés SUIVANTS de la chaîne qui le chevauchent
    // (réf/unité gardent leur ligne même quand les détails sont volumineux), puis
    // PLAFOND (obstacles/bas de carte) : l'excédent se coupe, ne se superpose pas.
    let hEff = it.el.offsetHeight
    let reserve = 0
    for (let j = i + 1; j < items.length; j++) {
      if (!isMagnetized(items[j].box, style)) continue
      const [jx1, jx2] = spanOf(items[j])
      if (x1 < jx2 && jx1 < x2) reserve += items[j].el.offsetHeight + MAGNET_GAP
    }
    const maxH = ceilingFor(x1, x2, top) - top - reserve
    if (hEff > maxH) {
      hEff = Math.max(0, Math.floor(maxH))
      it.el.style.maxHeight = `${hEff}px`
      it.el.style.overflow = 'hidden'
    }
    placed.push({ x1, x2, bottom: top + hEff })
  }
  // ── LIAISONS entre blocs (après la passe verticale : les cibles sont posées) :
  // un bloc lié est SOUDÉ à droite de sa cible, aligné sur son haut — il la suit
  // dans tous ses déplacements et sa volumétrie (ex. unité collée à la réf).
  // Récursif CIBLE D'ABORD : dans une chaîne A→B→C, C est posé avant B avant A
  // (sans cycle possible : validLink est acyclique par construction).
  const welded = new Set<CardObjectId>()
  const weld = (id: CardObjectId): void => {
    if (welded.has(id)) return
    welded.add(id)
    const link = validLink.get(id)
    if (!link) return
    weld(link)
    const box = freeLayoutBox(id, style)
    const el = card.querySelector<HTMLElement>(`.cat-obj[data-object-id="${id}"]`)
    const target = card.querySelector<HTMLElement>(`.cat-obj[data-object-id="${link}"]`)
    if (!el || !target) return
    // Soudure au bout du CONTENU de la cible (le texte RENDU), pas de sa boîte —
    // la boîte (w %) est souvent bien plus large que le texte, surtout sur les
    // cartes larges → le bloc lié serait soudé « dans le vide ». Mesure par Range
    // (fiable même quand le texte est display:block, où offsetWidth = la boîte).
    let targetW = target.offsetWidth
    const inner = target.firstElementChild
    if (inner) {
      // ⚠ Range mesure à l'ÉCRAN (affecté par le zoom/scale de l'aperçu) alors que
      // offsetLeft/clientWidth sont en unités de MISE EN PAGE : diviser par le
      // facteur d'échelle réel de l'élément, sinon la soudure dérive avec le zoom.
      const scale = target.offsetWidth ? target.getBoundingClientRect().width / target.offsetWidth : 0
      const rg = document.createRange()
      rg.selectNodeContents(inner)
      const w = scale > 0 ? rg.getBoundingClientRect().width / scale : 0
      if (w > 0) targetW = w
      else if ((inner as HTMLElement).offsetWidth) targetW = (inner as HTMLElement).offsetWidth
    }
    // lx/ly = décalage ajusté par l'utilisateur (glisser SANS rompre la liaison).
    el.style.left = `${Math.round((((target.offsetLeft + targetW + MAGNET_GAP) / cardW) * 100 + (box.lx ?? 0)) * 10) / 10}%`
    el.style.top = `${Math.round(((target.offsetTop / cardH) * 100 + (box.ly ?? 0)) * 10) / 10}%`
  }
  for (const id of validLink.keys()) weld(id)
  // ── CLAMP : rien ne sort JAMAIS du bas de la carte. Un bloc désancré par le
  // drag (ex. prix posé en % sur la carte d'aperçu, plus haute que les cellules
  // réelles), un bloc lié entraîné par sa cible ou un badge trop bas est REMONTÉ
  // au ras du bord au lieu d'être coupé par l'overflow de la fiche.
  for (const id of CARD_OBJECT_IDS) {
    if (id === 'image' || id === 'promo') continue
    if (items.some((it) => it.id === id)) continue // chaîne : déjà bornée (plafonds)
    const b = freeLayoutBox(id, style)
    const linked = validLink.has(id)
    const ay = linked ? 't' : (b.ay ?? 't')
    if (ay !== 't') continue // ancré bas/centre : ne déborde pas du bas par construction
    const el = objOf(id)
    if (!el) continue
    const h = el.offsetHeight * (b.sc ?? 1)
    const topPx = linked ? el.offsetTop : (b.y / 100) * cardH
    if (topPx + h > cardH) el.style.top = `${Math.round((Math.max(0, cardH - h) / cardH) * 1000) / 10}%`
    else if (!linked) el.style.top = `${b.y}%` // reset idempotent d'un clamp précédent
  }
}

/** Position VISUELLE (%) d'un objet dans la carte d'aperçu (.cat-style-card-host) —
 *  pour délier sans faire sauter le bloc (on fige sa position affichée). */
export function visualPos(id: CardObjectId): { x: number; y: number } | null {
  const card = document.querySelector<HTMLElement>('.cat-style-card-host')
  const el = card?.querySelector<HTMLElement>(`.cat-obj[data-object-id="${id}"]`)
  if (!card || !el || !card.clientWidth || !card.clientHeight) return null
  return {
    x: Math.round((el.offsetLeft / card.clientWidth) * 1000) / 10,
    y: Math.round((el.offsetTop / card.clientHeight) * 1000) / 10,
  }
}
