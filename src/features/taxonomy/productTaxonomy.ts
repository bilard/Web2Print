import type { ExcelRow } from '@/features/excel/types'
import type { Taxonomy, TaxonomyNode } from './types'
import { findPath, getAllDescendantIds } from './taxonomyUtils'

/** Clés spéciales sur une ExcelRow : liaison vers un nœud de taxonomie globale.
 *  Préfixe `_` → pas rendu comme colonne du tableau. */
export const PRODUCT_TAXONOMY_ID_KEY = '_taxonomyId'
export const PRODUCT_TAXONOMY_NODE_ID_KEY = '_taxonomyNodeId'

/** Clé spéciale dans `taxonomyNavFilter` pour le filtre par nœud de taxonomie
 *  globale (préfixe `__` pour ne jamais matcher une colKey utilisateur).
 *  Valeur : `taxonomyId|nodeId`. */
export const GLOBAL_TAXO_FILTER_KEY = '__globalTaxoNode'
const GLOBAL_TAXO_FILTER_SEP = '|'

export function encodeGlobalTaxoFilter(taxonomyId: string, nodeId: string): string {
  return `${taxonomyId}${GLOBAL_TAXO_FILTER_SEP}${nodeId}`
}

export function decodeGlobalTaxoFilter(value: string): { taxonomyId: string; nodeId: string } | null {
  const sepIdx = value.indexOf(GLOBAL_TAXO_FILTER_SEP)
  if (sepIdx <= 0 || sepIdx === value.length - 1) return null
  return {
    taxonomyId: value.slice(0, sepIdx),
    nodeId: value.slice(sepIdx + 1),
  }
}

/** Construit un prédicat (row → boolean) pour le filtre global encodé. Précalcule
 *  le set des nodeIds valides (nœud + descendants) une seule fois pour O(1) par row. */
export function buildGlobalTaxoFilterPredicate(
  filterValue: string,
  taxonomies: Taxonomy[] | undefined,
): (row: ExcelRow) => boolean {
  const decoded = decodeGlobalTaxoFilter(filterValue)
  if (!decoded || !taxonomies) return () => true
  const taxonomy = taxonomies.find((t) => t.id === decoded.taxonomyId)
  if (!taxonomy) return () => true
  const validIds = new Set<string>([
    decoded.nodeId,
    ...getAllDescendantIds(taxonomy.nodes, decoded.nodeId),
  ])
  return (row) => {
    const link = getProductTaxonomyLink(row)
    if (!link || link.taxonomyId !== decoded.taxonomyId) return false
    return validIds.has(link.nodeId)
  }
}

export interface ProductTaxonomyLink {
  taxonomyId: string
  nodeId: string
}

export function getProductTaxonomyLink(row: ExcelRow): ProductTaxonomyLink | null {
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
