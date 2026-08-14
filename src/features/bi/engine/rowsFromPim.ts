import type { Product } from '@/features/pim/types'
import { productToRow } from '../registry/pim.source'
import type { Row } from '../registry/types'

/**
 * Produits → lignes. Les colonnes attendues sont l'UNION de tous les champs rencontrés,
 * sauf si l'appelant impose une liste (schéma de la source).
 */
export function pimRows(products: Product[], columns: string[]): Row[] {
  const cols = columns.length
    ? columns
    : [...new Set(products.flatMap((p) => Object.keys(p.fields)))].sort()
  return products.map((p) => productToRow(p, cols))
}
