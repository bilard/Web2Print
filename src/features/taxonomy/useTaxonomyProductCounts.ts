import { useMemo } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import {
  PRODUCT_TAXONOMY_ID_KEY,
  PRODUCT_TAXONOMY_NODE_ID_KEY,
} from './productTaxonomy'
import type { Taxonomy, TaxonomyNode } from './types'

export interface TaxonomyProductCounts {
  /** Produits directement liés à ce nœud précis. */
  direct: Record<string, number>
  /** Produits liés au nœud OU à l'un de ses descendants (cumulé). */
  total: Record<string, number>
  /** Total tous-nœuds confondus pour cette taxonomie. */
  grandTotal: number
}

const EMPTY: TaxonomyProductCounts = { direct: {}, total: {}, grandTotal: 0 }

export function useTaxonomyProductCounts(
  taxonomy: Taxonomy | null | undefined,
): TaxonomyProductCounts {
  const sheets = useExcelStore((s) => s.sheets)
  return useMemo(() => {
    if (!taxonomy) return EMPTY
    const direct: Record<string, number> = {}
    const total: Record<string, number> = {}
    let grandTotal = 0
    for (const sheet of sheets) {
      for (const row of sheet.rows) {
        const taxId = row[PRODUCT_TAXONOMY_ID_KEY]
        const nodeId = row[PRODUCT_TAXONOMY_NODE_ID_KEY]
        if (taxId !== taxonomy.id) continue
        if (typeof nodeId !== 'string' || !taxonomy.nodes[nodeId]) continue
        direct[nodeId] = (direct[nodeId] ?? 0) + 1
        grandTotal += 1
        let current: TaxonomyNode | undefined = taxonomy.nodes[nodeId]
        const visited = new Set<string>()
        while (current && !visited.has(current.id)) {
          visited.add(current.id)
          total[current.id] = (total[current.id] ?? 0) + 1
          current = current.parentId ? taxonomy.nodes[current.parentId] : undefined
        }
      }
    }
    return { direct, total, grandTotal }
  }, [taxonomy, sheets])
}
