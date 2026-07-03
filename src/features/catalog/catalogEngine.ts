// Pagination déterministe du catalogue en 2 passes : (1) émettre les pages —
// le nombre de pages de sommaire est connu d'avance (nb de nœuds non vides) ;
// (2) remplir les entrées du sommaire avec les numéros réels.
//
// Flux CONTINU par univers : les produits de toutes les familles/sous-familles
// s'enchaînent sans rupture de page. Chaque page est une grille C×R remplie par
// PACKING first-fit avec spans : vedette = grande carte 2×2 AU SEIN de la page,
// fiche chère = carte élargie (paliers médiane/P80 par univers si sizeByPrice),
// repli 1×1 quand le span ne rentre plus → aucune case vide sauf sur la toute
// dernière page de l'univers. Densité 'random' : grille tirée page à page via
// PRNG seedé par l'id d'univers (rendu stable entre aperçu et export).
import type { CatalogGrid, CatalogPageDescriptor, CatalogSectionPlan, CatalogTreeNode, OpenerFamily, ProductSlot, TocEntry } from './catalogTypes'
import { GRID_DIMS } from './catalogTypes'
import { flattenTree } from './catalogTree'

export const TOC_ENTRIES_PER_PAGE = 24
export const DEFAULT_GRID: CatalogGrid = 4
/** Densités tirées en mode aléatoire (pondérées vers 4/6 pour rester catalogue). */
const RANDOM_GRID_POOL: CatalogGrid[] = [2, 3, 4, 4, 6, 6, 8]

export interface PaginateInput {
  tree: CatalogTreeNode[]
  sections: CatalogSectionPlan[]
  /** Taille des fiches ∝ prix. Défaut : actif dès que `prices` est fourni. */
  sizeByPrice?: boolean
  /** rowId → prix de vente (newPrice ?? oldPrice) — nécessaire au sizing par prix. */
  prices?: Map<string, number | null>
}

function subtreeProductCount(n: CatalogTreeNode): number {
  return n.productIds.length + n.children.reduce((acc, c) => acc + subtreeProductCount(c), 0)
}

interface FlowItem {
  rowId: string
  featured: boolean
  path: string[]
  /** Chaîne d'ids ancêtres+nœud — pour enregistrer la première page de chaque nœud. */
  chain: string[]
}

/* ── PRNG déterministe (mulberry32 + hash de chaîne) ─────────────────────── */
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  return h >>> 0
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Paliers de prix par univers : > P80 → 2×2, > médiane → carte élargie ── */
function priceThresholds(values: number[]): { p50: number; p80: number } | null {
  if (values.length < 3) return null
  const v = [...values].sort((a, b) => a - b)
  return { p50: v[Math.floor(0.5 * (v.length - 1))], p80: v[Math.floor(0.8 * (v.length - 1))] }
}

/** Span voulu d'un item sur une grille C×R (sera dégradé au packing s'il ne rentre plus). */
function wantedSpan(item: FlowItem, price: number | null, th: { p50: number; p80: number } | null, C: number, R: number): [number, number] {
  if (item.featured) return [Math.min(2, C), Math.min(2, R)]
  if (th && price != null) {
    if (price > th.p80) return [Math.min(2, C), Math.min(2, R)]
    if (price > th.p50) return C >= 2 ? [2, 1] : [1, Math.min(2, R)]
  }
  return [1, 1]
}

function findFit(occ: boolean[][], w: number, h: number): { r: number; c: number } | null {
  const R = occ.length, C = occ[0].length
  for (let r = 0; r + h <= R; r++) {
    for (let c = 0; c + w <= C; c++) {
      let ok = true
      for (let dr = 0; dr < h && ok; dr++) for (let dc = 0; dc < w && ok; dc++) if (occ[r + dr][c + dc]) ok = false
      if (ok) return { r, c }
    }
  }
  return null
}

/** Candidats de dégradation d'un span (garde d'abord la largeur, puis la hauteur, puis 1×1). */
function shrinkCandidates(w: number, h: number): [number, number][] {
  const out: [number, number][] = [[w, h]]
  if (h > 1) out.push([w, 1])
  if (w > 1) out.push([1, h])
  if (w > 1 || h > 1) out.push([1, 1])
  return out
}

export function paginateCatalog(input: PaginateInput): CatalogPageDescriptor[] {
  const byNode = new Map(input.sections.map((s) => [s.nodeId, s]))
  const prices = input.prices ?? new Map<string, number | null>()
  const sizeByPrice = input.sizeByPrice ?? prices.size > 0
  const kept = input.tree.filter((u) => subtreeProductCount(u) > 0)
  const tocNodes = flattenTree(kept).filter((n) => subtreeProductCount(n) > 0)
  const tocPageCount = Math.max(1, Math.ceil(tocNodes.length / TOC_ENTRIES_PER_PAGE))

  const pages: CatalogPageDescriptor[] = [{ kind: 'cover', pageNumber: 1 }]
  for (let i = 0; i < tocPageCount; i++) pages.push({ kind: 'toc', pageNumber: pages.length + 1, entries: [] })

  const nodePage = new Map<string, number>()
  const register = (chain: string[], pageNumber: number) => {
    for (const id of chain) if (!nodePage.has(id)) nodePage.set(id, pageNumber)
  }

  kept.forEach((univers, universIndex) => {
    const families: OpenerFamily[] = univers.children
      .filter((c) => subtreeProductCount(c) > 0)
      .map((c) => ({ label: c.label, count: subtreeProductCount(c), subs: c.children.filter((s) => subtreeProductCount(s) > 0).map((s) => s.label) }))
    pages.push({
      kind: 'opener', pageNumber: pages.length + 1, nodeId: univers.id, label: univers.label,
      index: universIndex + 1, productCount: subtreeProductCount(univers), families,
    })
    nodePage.set(univers.id, pages.length)
    const section = byNode.get(univers.id)
    const fixedGrid = section?.productsPerPage ?? DEFAULT_GRID
    const rng = mulberry32(hashSeed(univers.id))

    // Collecte DFS : vedettes en tête (grande carte sur la 1re page), puis flux continu.
    const featuredItems: FlowItem[] = []
    const flowItems: FlowItem[] = []
    const collect = (node: CatalogTreeNode, path: string[], chain: string[]) => {
      const featured = new Set(byNode.get(node.id)?.featuredIds ?? [])
      for (const rowId of node.productIds) {
        const item: FlowItem = { rowId, featured: featured.has(rowId), path, chain }
        if (item.featured) featuredItems.push(item)
        else flowItems.push(item)
      }
      for (const child of node.children) {
        if (subtreeProductCount(child) === 0) continue
        collect(child, [...path, child.label], [...chain, child.id])
      }
    }
    collect(univers, [univers.label], [univers.id])
    const queue = [...featuredItems, ...flowItems]

    const th = sizeByPrice
      ? priceThresholds(queue.map((i) => prices.get(i.rowId)).filter((p): p is number => p != null))
      : null

    // Packing page à page : first-fit avec dégradation de span → zéro case vide
    // tant qu'il reste des produits (le repli 1×1 rentre toujours).
    while (queue.length > 0) {
      const grid = section?.randomDensity ? RANDOM_GRID_POOL[Math.floor(rng() * RANDOM_GRID_POOL.length)] : fixedGrid
      const [C, R] = GRID_DIMS[grid]
      const occ: boolean[][] = Array.from({ length: R }, () => Array<boolean>(C).fill(false))
      const slots: ProductSlot[] = []
      const pageNumber = pages.length + 1
      while (queue.length > 0) {
        const item = queue[0]
        const [w, h] = wantedSpan(item, prices.get(item.rowId) ?? null, th, C, R)
        let placed: { r: number; c: number; w: number; h: number } | null = null
        for (const [cw, ch] of shrinkCandidates(w, h)) {
          const pos = findFit(occ, cw, ch)
          if (pos) { placed = { ...pos, w: cw, h: ch }; break }
        }
        if (!placed) break // page pleine
        for (let dr = 0; dr < placed.h; dr++) for (let dc = 0; dc < placed.w; dc++) occ[placed.r + dr][placed.c + dc] = true
        queue.shift()
        register(item.chain, pageNumber)
        slots.push({
          rowId: item.rowId, featured: item.featured, path: item.path,
          col: placed.c + 1, row: placed.r + 1, colSpan: placed.w, rowSpan: placed.h,
        })
      }
      if (slots.length === 0) break // garde théorique (grille 1×1 minimum → jamais atteint)
      const breadcrumb = slots[0].path.slice(0, 2) // univers › famille du 1er slot
      pages.push({ kind: 'products', pageNumber, nodeId: univers.id, breadcrumb, grid, slots })
    }
  })
  pages.push({ kind: 'back-cover', pageNumber: pages.length + 1 })

  // Passe 2 : entrées du sommaire avec numéros réels.
  const entries: TocEntry[] = tocNodes
    .map((n) => ({ nodeId: n.id, label: n.label, level: n.level, pageNumber: nodePage.get(n.id) ?? 0 }))
    .filter((e) => e.pageNumber > 0)
  let cursor = 0
  for (const p of pages) {
    if (p.kind !== 'toc') continue
    p.entries = entries.slice(cursor, cursor + TOC_ENTRIES_PER_PAGE)
    cursor += TOC_ENTRIES_PER_PAGE
  }
  return pages
}
