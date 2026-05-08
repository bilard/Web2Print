import { useMemo } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import {
  PRODUCT_TAXONOMY_ID_KEY,
  PRODUCT_TAXONOMY_NODE_ID_KEY,
} from './productTaxonomy'
import { findPath } from './taxonomyUtils'
import type { Taxonomy } from './types'

export interface TaxonomyProductCounts {
  /** Produits directement liés à ce nœud précis. */
  direct: Record<string, number>
  /** Produits liés au nœud OU à l'un de ses descendants (cumulé). */
  total: Record<string, number>
  /** Total tous-nœuds confondus pour cette taxonomie. */
  grandTotal: number
}

const EMPTY: TaxonomyProductCounts = { direct: {}, total: {}, grandTotal: 0 }

/** Hook canonique : scan unique des sheets, regroupe par taxonomyId. À utiliser
 *  quand un composant affiche plusieurs taxonomies — évite N×M boucles. */
export function useAllTaxonomyProductCounts(
  taxonomies: readonly Taxonomy[],
): Map<string, TaxonomyProductCounts> {
  const sheets = useExcelStore((s) => s.sheets)
  return useMemo(() => {
    const result = new Map<string, TaxonomyProductCounts>()
    if (taxonomies.length === 0) return result
    const taxById = new Map(taxonomies.map((t) => [t.id, t]))
    for (const tax of taxonomies) {
      result.set(tax.id, { direct: {}, total: {}, grandTotal: 0 })
    }
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        const taxId = row[PRODUCT_TAXONOMY_ID_KEY]
        const nodeId = row[PRODUCT_TAXONOMY_NODE_ID_KEY]
        if (typeof taxId !== 'string' || typeof nodeId !== 'string') continue
        const tax = taxById.get(taxId)
        if (!tax || !tax.nodes[nodeId]) continue
        const counts = result.get(taxId)!
        counts.direct[nodeId] = (counts.direct[nodeId] ?? 0) + 1
        counts.grandTotal += 1
        for (const ancestorId of findPath(tax.nodes, nodeId)) {
          counts.total[ancestorId] = (counts.total[ancestorId] ?? 0) + 1
        }
      }
    }
    return result
  }, [taxonomies, sheets])
}

/** Wrapper rétrocompat pour les call-sites n'ayant qu'une taxonomie. */
export function useTaxonomyProductCounts(
  taxonomy: Taxonomy | null | undefined,
): TaxonomyProductCounts {
  const list = useMemo(() => (taxonomy ? [taxonomy] : []), [taxonomy])
  const map = useAllTaxonomyProductCounts(list)
  return taxonomy ? (map.get(taxonomy.id) ?? EMPTY) : EMPTY
}
