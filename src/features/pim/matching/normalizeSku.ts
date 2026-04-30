/** Champs candidats triés par priorité (EAN/GTIN d'abord car internationaux). */
const SKU_FIELDS = ['ean', 'gtin', 'sku', 'ref', 'reference', 'code'] as const

export interface SkuCandidate {
  sku?: string | null
  ean?: string | null
  gtin?: string | null
  ref?: string | null
  reference?: string | null
  code?: string | null
  [key: string]: unknown
}

/** Canonicalise une clé d'identité produit.
 *  - lowercase
 *  - garde uniquement [a-z0-9]
 *  - renvoie null si moins d'un caractère utile
 */
export function normalizeSku(row: SkuCandidate): string | null {
  for (const field of SKU_FIELDS) {
    const raw = row[field]
    if (typeof raw !== 'string') continue
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (cleaned.length > 0) return cleaned
  }
  return null
}
