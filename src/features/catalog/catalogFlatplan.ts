// src/features/catalog/catalogFlatplan.ts
// Moteur PUR du chemin de fer (flat plan) : clés de page stables, ordre manuel
// persisté (pageOrder), regroupement en planches et statistiques. La couverture,
// le sommaire et la 4e restent verrouillés à leur place ; seules les pages
// d'ouverture et de produits se réordonnent. Après réordonnancement, les numéros
// de page ET les entrées du sommaire sont recalculés (sinon export faux).
import type { CatalogPageDescriptor } from './catalogTypes'

/** Genres de pages verrouillés (non triables) dans le chemin de fer. */
const LOCKED_KINDS = new Set(['cover', 'toc', 'back-cover'])

export function isLockedPage(page: CatalogPageDescriptor): boolean {
  return LOCKED_KINDS.has(page.kind)
}

/**
 * Clés STABLES alignées sur `pages` : survivent à la re-pagination tant que le
 * contenu ne bouge pas (produits d'un nœud numérotés dans l'ordre canonique).
 */
export function pageKeysOf(pages: CatalogPageDescriptor[]): string[] {
  const perNode = new Map<string, number>()
  let toc = 0
  return pages.map((p) => {
    if (p.kind === 'cover') return 'cover'
    if (p.kind === 'back-cover') return 'back-cover'
    if (p.kind === 'toc') return `toc:${toc++}`
    if (p.kind === 'opener') return `opener:${p.nodeId}`
    const n = perNode.get(p.nodeId) ?? 0
    perNode.set(p.nodeId, n + 1)
    return `products:${p.nodeId}:${n}`
  })
}

/** Ids de nœuds taxonomiques portés par une page (navigation/stats). */
function pageNodeIds(p: CatalogPageDescriptor): string[] {
  if (p.kind === 'opener') return [p.nodeId]
  if (p.kind === 'products') return p.nodeIds ?? [p.nodeId]
  return []
}

/**
 * Applique l'ordre manuel : les clés connues suivent `order`, une clé inconnue
 * (page apparue après le tri : densité changée…) hérite du rang de la page
 * connue qui la précédait dans l'ordre canonique. Renumérote toutes les pages
 * et remet à jour les numéros du sommaire.
 */
export function applyPageOrder(pages: CatalogPageDescriptor[], order: string[]): { pages: CatalogPageDescriptor[]; keys: string[] } {
  const keys = pageKeysOf(pages)
  const rank = new Map(order.map((k, i) => [k, i]))
  type Item = { page: CatalogPageDescriptor; key: string; rank: number; canonical: number }
  const head: Item[] = []
  const middle: Item[] = []
  const tail: Item[] = []
  let lastRank = -1
  pages.forEach((page, i) => {
    const key = keys[i]
    const item: Item = { page, key, rank: 0, canonical: i }
    if (page.kind === 'back-cover') { tail.push(item); return }
    if (isLockedPage(page)) { head.push(item); return }
    const r = rank.get(key)
    // Inconnue → glissée juste après la dernière page classée (+0.5 : jamais d'égalité avec une vraie).
    item.rank = r ?? lastRank + 0.5
    if (r !== undefined) lastRank = r
    middle.push(item)
  })
  middle.sort((a, b) => a.rank - b.rank || a.canonical - b.canonical)
  const ordered = [...head, ...middle, ...tail]
  // Renumérotation (clones : le résultat de paginateCatalog ne doit pas être muté).
  const outPages = ordered.map((it, i) => ({ ...it.page, pageNumber: i + 1 }) as CatalogPageDescriptor)
  // Sommaire : chaque entrée pointe vers la PREMIÈRE page portant son nœud dans le nouvel ordre.
  const firstOf = new Map<string, number>()
  for (const p of outPages) for (const id of pageNodeIds(p)) if (!firstOf.has(id)) firstOf.set(id, p.pageNumber)
  for (const p of outPages) {
    if (p.kind !== 'toc') continue
    p.entries = p.entries.map((e) => ({ ...e, pageNumber: firstOf.get(e.nodeId) ?? e.pageNumber }))
  }
  return { pages: outPages, keys: ordered.map((it) => it.key) }
}

/** Une planche : verso (gauche) + recto (droite). La page 1 est un recto seul. */
export interface Spread { index: number; left: number | null; right: number | null }

/** Regroupe les indices de pages en planches façon brochure : [—,1] [2,3] [4,5]… */
export function buildSpreads(pageCount: number): Spread[] {
  if (pageCount <= 0) return []
  const spreads: Spread[] = [{ index: 1, left: null, right: 0 }]
  for (let i = 1; i < pageCount; i += 2) {
    spreads.push({ index: spreads.length + 1, left: i, right: i + 1 < pageCount ? i + 1 : null })
  }
  return spreads
}

export interface FlatplanStats {
  pages: number
  spreads: number
  productPages: number
  openers: number
  products: number
  featured: number
  /** Produits par page produits (moyenne, 1 décimale). */
  avgPerPage: number
}

export function flatplanStats(pages: CatalogPageDescriptor[]): FlatplanStats {
  let productPages = 0, openers = 0, products = 0, featured = 0
  for (const p of pages) {
    if (p.kind === 'opener') openers++
    if (p.kind !== 'products') continue
    productPages++
    products += p.slots.length
    featured += p.slots.filter((s) => s.featured).length
  }
  return {
    pages: pages.length, spreads: buildSpreads(pages.length).length,
    productPages, openers, products, featured,
    avgPerPage: productPages > 0 ? Math.round((products / productPages) * 10) / 10 : 0,
  }
}

export interface NodePageRange { first: number; last: number; pageCount: number }

/** Plage de pages de chaque nœud taxonomique (numéros APRÈS réordonnancement). */
export function nodePageRanges(pages: CatalogPageDescriptor[]): Map<string, NodePageRange> {
  const out = new Map<string, NodePageRange>()
  for (const p of pages) {
    for (const id of pageNodeIds(p)) {
      const cur = out.get(id)
      if (!cur) out.set(id, { first: p.pageNumber, last: p.pageNumber, pageCount: 1 })
      else { cur.first = Math.min(cur.first, p.pageNumber); cur.last = Math.max(cur.last, p.pageNumber); cur.pageCount++ }
    }
  }
  return out
}

/** Couleurs cycliques des univers (repère visuel du chemin de fer, indépendantes du thème). */
const UNIVERSE_PALETTE = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#a855f7', '#ef4444', '#14b8a6']

/** univers → couleur (ordre d'apparition des affiches, cyclique). */
export function universeColors(pages: CatalogPageDescriptor[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of pages) {
    if (p.kind !== 'opener' && p.kind !== 'products') continue
    // nodeId des pages produits = univers (le moteur pagine par univers).
    if (!out.has(p.nodeId)) out.set(p.nodeId, UNIVERSE_PALETTE[out.size % UNIVERSE_PALETTE.length])
  }
  return out
}
