// Pagination déterministe du catalogue en 2 passes : (1) émettre les pages —
// le nombre de pages de sommaire est connu d'avance (nb de nœuds non vides) ;
// (2) remplir les entrées du sommaire avec les numéros réels.
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

  const emitProducts = (node: CatalogTreeNode, breadcrumb: string[], chain: string[], inheritedGrid: CatalogGrid) => {
    const cfg = byNode.get(node.id)
    const grid = cfg?.productsPerPage ?? inheritedGrid
    const featured = new Set(cfg?.featuredIds ?? [])
    const flow: ProductSlot[] = []
    for (const rowId of node.productIds) {
      if (featured.has(rowId)) {
        register(chain)
        pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: node.id, breadcrumb, grid: 1, slots: [{ rowId, featured: true }] })
      } else {
        flow.push({ rowId, featured: false })
      }
    }
    for (let i = 0; i < flow.length; i += grid) {
      register(chain)
      pages.push({ kind: 'products', pageNumber: pages.length + 1, nodeId: node.id, breadcrumb, grid, slots: flow.slice(i, i + grid) })
    }
    for (const child of node.children) {
      if (subtreeProductCount(child) === 0) continue
      emitProducts(child, [...breadcrumb, child.label], [...chain, child.id], grid)
    }
  }

  for (const univers of kept) {
    pages.push({ kind: 'opener', pageNumber: pages.length + 1, nodeId: univers.id, label: univers.label })
    nodePage.set(univers.id, pages.length)
    const grid = byNode.get(univers.id)?.productsPerPage ?? DEFAULT_GRID
    emitProducts(univers, [univers.label], [univers.id], grid)
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
