// Pagination déterministe du catalogue en 2 passes : (1) émettre les pages —
// le nombre de pages de sommaire est connu d'avance (nb de nœuds non vides) ;
// (2) remplir les entrées du sommaire avec les numéros réels.
//
// Flux CONTINU par univers : une seule grille (config du nœud univers, sinon
// défaut), les produits de toutes les familles/sous-familles s'enchaînent sans
// rupture de page → aucune case vide sauf sur la toute dernière page de
// l'univers. Chaque slot porte son `path` (la fiche affiche sa sous-famille en
// kicker). Les vedettes sortent du flux : une pleine page chacune, regroupées
// juste après l'ouverture de l'univers.
import type { CatalogGrid, CatalogPageDescriptor, CatalogSectionPlan, CatalogTreeNode, ProductSlot, TocEntry } from './catalogTypes'
import { flattenTree } from './catalogTree'

export const TOC_ENTRIES_PER_PAGE = 24
export const DEFAULT_GRID: CatalogGrid = 4

export interface PaginateInput {
  tree: CatalogTreeNode[]
  sections: CatalogSectionPlan[]
}

function subtreeProductCount(n: CatalogTreeNode): number {
  return n.productIds.length + n.children.reduce((acc, c) => acc + subtreeProductCount(c), 0)
}

interface FlowItem {
  slot: ProductSlot
  /** Chaîne d'ids ancêtres+nœud — pour enregistrer la première page de chaque nœud. */
  chain: string[]
}

export function paginateCatalog(input: PaginateInput): CatalogPageDescriptor[] {
  const byNode = new Map(input.sections.map((s) => [s.nodeId, s]))
  const kept = input.tree.filter((u) => subtreeProductCount(u) > 0)
  const tocNodes = flattenTree(kept).filter((n) => subtreeProductCount(n) > 0)
  const tocPageCount = Math.max(1, Math.ceil(tocNodes.length / TOC_ENTRIES_PER_PAGE))

  const pages: CatalogPageDescriptor[] = [{ kind: 'cover', pageNumber: 1 }]
  for (let i = 0; i < tocPageCount; i++) pages.push({ kind: 'toc', pageNumber: pages.length + 1, entries: [] })

  const nodePage = new Map<string, number>()
  const register = (chain: string[]) => {
    for (const id of chain) if (!nodePage.has(id)) nodePage.set(id, pages.length + 1)
  }

  for (const univers of kept) {
    pages.push({ kind: 'opener', pageNumber: pages.length + 1, nodeId: univers.id, label: univers.label })
    nodePage.set(univers.id, pages.length)
    const grid = byNode.get(univers.id)?.productsPerPage ?? DEFAULT_GRID

    // Collecte DFS : vedettes (pleine page) d'un côté, flux continu de l'autre.
    const featuredItems: FlowItem[] = []
    const flowItems: FlowItem[] = []
    const collect = (node: CatalogTreeNode, path: string[], chain: string[]) => {
      const featured = new Set(byNode.get(node.id)?.featuredIds ?? [])
      for (const rowId of node.productIds) {
        const item: FlowItem = { slot: { rowId, featured: featured.has(rowId), path }, chain }
        if (featured.has(rowId)) featuredItems.push(item)
        else flowItems.push(item)
      }
      for (const child of node.children) {
        if (subtreeProductCount(child) === 0) continue
        collect(child, [...path, child.label], [...chain, child.id])
      }
    }
    collect(univers, [univers.label], [univers.id])

    // Vedettes : une pleine page chacune, en tête d'univers.
    for (const item of featuredItems) {
      register(item.chain)
      pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: univers.id, breadcrumb: item.slot.path.slice(0, 2), grid: 1, slots: [item.slot] })
    }
    // Flux continu : pages remplies à ras bord, sans rupture aux sous-familles.
    for (let i = 0; i < flowItems.length; i += grid) {
      const chunk = flowItems.slice(i, i + grid)
      for (const item of chunk) register(item.chain)
      const breadcrumb = chunk[0].slot.path.slice(0, 2) // univers › famille du 1er slot
      pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: univers.id, breadcrumb, grid, slots: chunk.map((c) => c.slot) })
    }
  }
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
