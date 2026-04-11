interface AiSuggestion {
  sku: string
  quantity: number
  aiJustification: string
}

interface GuardRailResult {
  kept: AiSuggestion[]
  invalidSkus: string[]
  shouldRetry: boolean
}

const INVALID_RATIO_THRESHOLD = 0.3

/**
 * Filtre les suggestions IA pour ne conserver que les SKUs présents dans le catalogue.
 * Si plus de 30% des suggestions ont un SKU inconnu, recommande un retry.
 */
export function filterValidSkus(
  suggestions: AiSuggestion[],
  catalogSkus: string[],
): GuardRailResult {
  if (suggestions.length === 0) {
    return { kept: [], invalidSkus: [], shouldRetry: false }
  }
  const set = new Set(catalogSkus)
  const kept: AiSuggestion[] = []
  const invalidSkus: string[] = []
  for (const s of suggestions) {
    if (set.has(s.sku)) kept.push(s)
    else invalidSkus.push(s.sku)
  }
  const ratio = invalidSkus.length / suggestions.length
  return { kept, invalidSkus, shouldRetry: ratio > INVALID_RATIO_THRESHOLD }
}
