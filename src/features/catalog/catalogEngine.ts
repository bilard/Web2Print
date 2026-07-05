// Pagination déterministe du catalogue en 2 passes : (1) émettre les pages —
// le nombre de pages de sommaire est connu d'avance (nb de nœuds non vides) ;
// (2) remplir les entrées du sommaire avec les numéros réels.
//
// Flux CONTINU par univers : les produits de toutes les familles/sous-familles
// s'enchaînent sans rupture de page. Chaque page est une grille C×R remplie par
// PACKING first-fit avec spans : vedette = grande carte mise en avant AU SEIN de
// la page (1 vedette MAX par page, span plafonné pour ne JAMAIS couvrir la page
// entière tant qu'il reste du flux), fiche chère = carte élargie (paliers
// médiane/P80 par univers si sizeByPrice, même plafond), repli 1×1 quand le span
// ne rentre plus, puis passe d'ÉTIREMENT sur la dernière page (les cartes
// absorbent les cases restantes) → JAMAIS de case vide. Densité 'random' :
// grille tirée page à page via PRNG seedé par l'id d'univers (rendu stable
// entre aperçu et export).
import type { CatalogGrid, CatalogPageDescriptor, CatalogSectionPlan, CatalogTreeNode, OpenerFamily, ProductSlot, TocEntry } from './catalogTypes'
import { GRID_DIMS } from './catalogTypes'
import { flattenTree, subtreeProductCount } from './catalogTree'

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
  /** rowId → nom produit — alimente les « highlights » de l'affiche d'un univers sans familles. */
  names?: Map<string, string>
  /**
   * Mode UNIFORME (disposition libre) : UNE seule grille (`uniformGrid`) pour tout
   * le catalogue (densités par section et « aléatoire » ignorées) → la typo reste
   * constante (--cat-fit unique) et l'aperçu est fidèle. TOUT le reste (vedettes,
   * taille ∝ prix, bandeaux, étirement zéro-vide) fonctionne comme en auto : les
   * positions % de la disposition libre s'adaptent à la taille de chaque carte.
   */
  uniform?: boolean
  uniformGrid?: CatalogGrid
}

/** Grille représentative des sections (densité fixe la plus fréquente) — pour le
 *  mode uniforme et l'aspect de l'aperçu. Repli DEFAULT_GRID si mixte/vide. */
export function representativeGrid(sections: CatalogSectionPlan[]): CatalogGrid {
  const counts = new Map<CatalogGrid, number>()
  for (const s of sections) {
    if (s.randomDensity) continue
    const g = s.productsPerPage as CatalogGrid
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  let best: CatalogGrid = DEFAULT_GRID, bestN = 0
  for (const [g, n] of counts) if (n > bestN) { best = g; bestN = n }
  return best
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

/**
 * Grande carte (vedette ou prix > P80) plafonnée : jamais la page ENTIÈRE —
 * il doit rester au moins une case pour d'autres produits (grille 1/page exceptée).
 */
function bigSpan(C: number, R: number): [number, number] {
  let w = Math.min(2, C)
  let h = Math.min(2, R)
  while (w * h >= C * R && (h > 1 || w > 1)) { if (h > 1) h--; else w-- }
  return [w, h]
}

/**
 * Span voulu d'un item sur une grille C×R (sera dégradé au packing s'il ne
 * rentre plus). Agrandissement PRIX = carte élargie seulement (jamais 2×2,
 * réservé aux vedettes) : la densité choisie par l'utilisateur reste reine —
 * l'appelant borne en plus à UN agrandissement prix par page.
 */
function wantedSpan(item: FlowItem, price: number | null, th: { p50: number; p80: number } | null, C: number, R: number): [number, number] {
  if (item.featured) return bigSpan(C, R)
  if (th && price != null && price > th.p50) return C >= 2 ? [2, 1] : [1, Math.min(2, R)]
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

/**
 * Réaffecte les produits d'une page aux emplacements par PRIX décroissant :
 * la plus grande carte reçoit le prix le plus haut. Le packing attribue les
 * spans dans l'ordre du flux — un produit moyen (> médiane) peut consommer
 * l'emplacement large avant qu'un produit PLUS cher n'arrive (dégradé 1×1).
 * On échange donc les contenus (géométrie intacte, vedettes exclues).
 */
function reassignByPrice(slots: ProductSlot[], prices: Map<string, number | null>): void {
  const movable = slots.filter((s) => !s.featured)
  if (movable.length < 2) return
  const area = (s: ProductSlot) => s.colSpan * s.rowSpan
  // ÉCHANGES MINIMAUX : seule chaque grande carte troque son contenu avec le
  // produit le plus cher restant — l'ordre du flux (produits GROUPÉS par
  // sous-famille) est préservé sur toutes les autres fiches.
  const bigs = movable.filter((s) => area(s) > 1).sort((a, b) => area(b) - area(a))
  const assigned = new Set<ProductSlot>()
  // Échanges INTRA-GROUPE seulement : un produit ne doit pas changer de section.
  const groupOf = (s: ProductSlot) => (s.path.length > 1 ? s.path[s.path.length - 1] : null)
  for (const big of bigs) {
    let best: ProductSlot | null = null
    for (const s of movable) {
      if (assigned.has(s) || groupOf(s) !== groupOf(big)) continue
      if (!best || (prices.get(s.rowId) ?? -1) > (prices.get(best.rowId) ?? -1)) best = s
    }
    assigned.add(big)
    if (!best || best === big) continue
    const tmp = { rowId: big.rowId, path: big.path }
    big.rowId = best.rowId; big.path = best.path
    best.rowId = tmp.rowId; best.path = tmp.path
  }
}

/**
 * Étire les cartes déjà placées pour absorber les cases restées libres (dernière
 * page d'un univers) : extension vers la DROITE de la carte à gauche en priorité
 * (reste dans la même rangée → ne traverse jamais un bandeau de sous-famille),
 * sinon vers le bas de la carte au-dessus (rangées vides de fin de page).
 * Multi-passes jusqu'à stabilité → JAMAIS de vide.
 */
function stretchToFill(occ: boolean[][], slots: ProductSlot[], C: number, R: number): void {
  const at = (r: number, c: number): ProductSlot | undefined =>
    slots.find((s) => r >= s.row - 1 && r < s.row - 1 + s.rowSpan && c >= s.col - 1 && c < s.col - 1 + s.colSpan)
  let progress = true
  while (progress) {
    progress = false
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (occ[r][c]) continue
        const left = c > 0 ? at(r, c - 1) : undefined
        if (left) {
          const leftRows = Array.from({ length: left.rowSpan }, (_, i) => left.row - 1 + i)
          const colRight = left.col - 1 + left.colSpan
          if (colRight < C && leftRows.every((rr) => !occ[rr][colRight])) {
            leftRows.forEach((rr) => { occ[rr][colRight] = true })
            left.colSpan++
            progress = true
            continue
          }
        }
        const above = r > 0 ? at(r - 1, c) : undefined
        if (above) {
          const cols = Array.from({ length: above.colSpan }, (_, i) => above.col - 1 + i)
          const rowBelow = above.row - 1 + above.rowSpan
          if (rowBelow < R && cols.every((cc) => !occ[rowBelow][cc])) {
            cols.forEach((cc) => { occ[rowBelow][cc] = true })
            above.rowSpan++
            progress = true
          }
        }
      }
    }
  }
}

export function paginateCatalog(input: PaginateInput): CatalogPageDescriptor[] {
  const byNode = new Map(input.sections.map((s) => [s.nodeId, s]))
  const prices = input.prices ?? new Map<string, number | null>()
  const uniform = input.uniform ?? false
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
    const section = byNode.get(univers.id)
    // Mode uniforme : UNE seule grille pour tout le catalogue (fiches identiques).
    const fixedGrid = uniform ? (input.uniformGrid ?? DEFAULT_GRID) : (section?.productsPerPage ?? DEFAULT_GRID)
    const rng = mulberry32(hashSeed(univers.id))

    // Collecte DFS : vedettes distribuées 1 par page, flux continu pour le reste.
    const featuredQueue: FlowItem[] = []
    const flowQueue: FlowItem[] = []
    const collect = (node: CatalogTreeNode, path: string[], chain: string[]) => {
      const featured = new Set(byNode.get(node.id)?.featuredIds ?? [])
      for (const rowId of node.productIds) {
        const item: FlowItem = { rowId, featured: featured.has(rowId), path, chain }
        if (item.featured) featuredQueue.push(item)
        else flowQueue.push(item)
      }
      for (const child of node.children) {
        if (subtreeProductCount(child) === 0) continue
        collect(child, [...path, child.label], [...chain, child.id])
      }
    }
    collect(univers, [univers.label], [univers.id])

    const families: OpenerFamily[] = univers.children
      .filter((c) => subtreeProductCount(c) > 0)
      .map((c) => ({ label: c.label, count: subtreeProductCount(c), subs: c.children.filter((s) => subtreeProductCount(s) > 0).map((s) => s.label) }))
    // Univers sans familles : l'affiche montre un extrait de la gamme (noms produits).
    const highlights = families.length > 0 ? [] : [...featuredQueue, ...flowQueue]
      .map((i) => input.names?.get(i.rowId) ?? '').filter(Boolean).slice(0, 8)
    pages.push({
      kind: 'opener', pageNumber: pages.length + 1, nodeId: univers.id, label: univers.label,
      index: universIndex + 1, productCount: subtreeProductCount(univers), families, highlights,
    })
    nodePage.set(univers.id, pages.length)

    const th = sizeByPrice
      ? priceThresholds([...featuredQueue, ...flowQueue].map((i) => prices.get(i.rowId)).filter((p): p is number => p != null))
      : null

    // Sous-famille = SECTION : chaque groupe démarre sur sa propre rangée,
    // marquée d'un bandeau (groupRows). Conservé entre les pages de l'univers.
    let currentGroup: string | null = null

    // Packing page à page : 1 vedette MAX par page (grande carte jamais pleine
    // page tant qu'il reste du flux), puis first-fit avec dégradation de span →
    // zéro case vide tant qu'il reste des produits (le repli 1×1 rentre toujours).
    while (featuredQueue.length > 0 || flowQueue.length > 0) {
      const grid = (!uniform && section?.randomDensity) ? RANDOM_GRID_POOL[Math.floor(rng() * RANDOM_GRID_POOL.length)] : fixedGrid
      const [C, R] = GRID_DIMS[grid]
      const occ: boolean[][] = Array.from({ length: R }, () => Array<boolean>(C).fill(false))
      const slots: ProductSlot[] = []
      const pageNodeIds = new Set<string>()
      const pageNumber = pages.length + 1
      const groupRows: { row: number; label: string }[] = []
      const pageGroupLabels = new Set<string>()
      const holes: { r: number; c: number }[] = []
      // Ferme la rangée entamée quand la sous-famille change : ses cases libres
      // sont rendues au groupe précédent (comblées par extension horizontale).
      const closeRow = () => {
        for (let r = R - 1; r >= 0; r--) {
          if (!occ[r].some(Boolean)) continue
          for (let c = 0; c < C; c++) if (!occ[r][c]) { occ[r][c] = true; holes.push({ r, c }) }
          break
        }
      }
      const place = (item: FlowItem, w: number, h: number): boolean => {
        let placed: { r: number; c: number; w: number; h: number } | null = null
        for (const [cw, ch] of shrinkCandidates(w, h)) {
          const pos = findFit(occ, cw, ch)
          if (pos) { placed = { ...pos, w: cw, h: ch }; break }
        }
        if (!placed) return false
        for (let dr = 0; dr < placed.h; dr++) for (let dc = 0; dc < placed.w; dc++) occ[placed.r + dr][placed.c + dc] = true
        register(item.chain, pageNumber)
        for (const id of item.chain) pageNodeIds.add(id)
        slots.push({
          rowId: item.rowId, featured: item.featured, path: item.path,
          col: placed.c + 1, row: placed.r + 1, colSpan: placed.w, rowSpan: placed.h,
        })
        return true
      }
      if (featuredQueue.length > 0) {
        // Pleine page UNIQUEMENT pour l'ultime vedette sans plus rien à mixer ;
        // sinon grande carte plafonnée (le flux ou les autres vedettes complètent).
        const [w, h] = flowQueue.length === 0 && featuredQueue.length === 1 ? [C, R] : bigSpan(C, R)
        if (place(featuredQueue[0], w, h)) featuredQueue.shift()
      }
      // Budget : UN agrandissement prix par page — sinon un univers cher (50 %
      // des produits > médiane) transforme « 6/page » en pages de 2-4 fiches.
      let priceUpgradesLeft = 1
      while (flowQueue.length > 0) {
        const item = flowQueue[0]
        const label = item.path.length > 1 ? item.path[item.path.length - 1] : null
        if (label !== currentGroup) {
          closeRow() // le groupe suivant démarre sur une NOUVELLE rangée
          currentGroup = label
        }
        let [w, h] = wantedSpan(item, prices.get(item.rowId) ?? null, th, C, R)
        // Mode UNIFORME (disposition libre) : la mise en avant prix = carte 2×2
        // (même aspect que la cellule) → la fiche est MAGNIFIÉE ×2 au rendu, la
        // mise en page libre reste identique. Une carte élargie [2,1] n'aurait
        // aucun effet visuel (typo constante).
        if (uniform && !item.featured && w * h > 1) [w, h] = bigSpan(C, R)
        const isPriceUpgrade = !item.featured && w * h > 1
        if (isPriceUpgrade && priceUpgradesLeft <= 0) { w = 1; h = 1 }
        if (!place(item, w, h)) break // page pleine
        if (isPriceUpgrade && priceUpgradesLeft > 0) priceUpgradesLeft--
        // Bandeau de section : première fiche du groupe SUR CETTE PAGE.
        if (label && !pageGroupLabels.has(label)) {
          pageGroupLabels.add(label)
          groupRows.push({ row: slots[slots.length - 1].row, label })
        }
        flowQueue.shift()
      }
      // Flux épuisé mais des vedettes restent : elles se PARTAGENT la page
      // (jamais une vedette seule sur sa page tant qu'il en reste plusieurs).
      while (flowQueue.length === 0 && featuredQueue.length > 0) {
        const [w, h] = bigSpan(C, R)
        if (!place(featuredQueue[0], w, h)) break // page pleine → suite page suivante
        featuredQueue.shift()
      }
      if (slots.length === 0) break // garde théorique (grille 1×1 minimum → jamais atteint)
      // Fins de rangée fermées par un changement de sous-famille : la carte de
      // gauche s'élargit (jamais d'extension VERTICALE à travers un bandeau).
      for (const { r, c } of holes) {
        const left = slots.find((s) => r >= s.row - 1 && r < s.row - 1 + s.rowSpan && c - 1 >= s.col - 1 && c - 1 < s.col - 1 + s.colSpan)
        if (left) left.colSpan++
      }
      // Cases restées libres (fin d'univers) : étirer les cartes → zéro vide.
      stretchToFill(occ, slots, C, R)
      // Après étirement (les aires sont définitives) : le prix le plus haut
      // occupe la plus grande carte de la page.
      if (sizeByPrice) reassignByPrice(slots, prices)
      const breadcrumb = slots[0].path.slice(0, 2) // univers › famille du 1er slot
      pages.push({
        kind: 'products', pageNumber, nodeId: univers.id, breadcrumb, grid, slots, nodeIds: [...pageNodeIds],
        ...(groupRows.length > 0 ? { groupRows } : {}),
      })
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
