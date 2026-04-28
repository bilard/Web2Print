import type { ExcelRow } from '@/features/excel/types'
import type { Taxonomy, TaxonomyNode } from './types'
import { findPath } from './taxonomyUtils'

/** Clés spéciales sur une ExcelRow : liaison vers un nœud de taxonomie globale.
 *  Préfixe `_` → pas rendu comme colonne du tableau. */
export const PRODUCT_TAXONOMY_ID_KEY = '_taxonomyId'
export const PRODUCT_TAXONOMY_NODE_ID_KEY = '_taxonomyNodeId'

export interface ProductTaxonomyLink {
  taxonomyId: string
  nodeId: string
}

function getProductTaxonomyLink(row: ExcelRow): ProductTaxonomyLink | null {
  const taxonomyId = row[PRODUCT_TAXONOMY_ID_KEY]
  const nodeId = row[PRODUCT_TAXONOMY_NODE_ID_KEY]
  if (typeof taxonomyId !== 'string' || !taxonomyId) return null
  if (typeof nodeId !== 'string' || !nodeId) return null
  return { taxonomyId, nodeId }
}

export interface ResolvedProductTaxonomy {
  taxonomy: Taxonomy
  node: TaxonomyNode
  pathLabels: string[]
  pathString: string
}

/** Résout la liaison `row → {taxonomy, node, chemin}` à partir de la liste des
 *  taxonomies. Renvoie null si la liaison est cassée (taxonomie/nœud supprimé). */
export function resolveProductTaxonomy(
  row: ExcelRow,
  taxonomies: Taxonomy[] | undefined,
): ResolvedProductTaxonomy | null {
  const link = getProductTaxonomyLink(row)
  if (!link || !taxonomies) return null
  const taxonomy = taxonomies.find((t) => t.id === link.taxonomyId)
  if (!taxonomy) return null
  const node = taxonomy.nodes[link.nodeId]
  if (!node) return null
  const pathIds = findPath(taxonomy.nodes, node.id)
  const pathLabels = pathIds.map((id) => taxonomy.nodes[id]?.label ?? '')
  return {
    taxonomy,
    node,
    pathLabels,
    pathString: pathLabels.join(' › '),
  }
}
