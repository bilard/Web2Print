const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR', 'EUR': 'EUR',
  '$': 'USD', 'USD': 'USD',
  '£': 'GBP', 'GBP': 'GBP',
  '¥': 'JPY', 'JPY': 'JPY',
  'CHF': 'CHF',
}

export interface ParsedPrice {
  amount: number | null
  currency: string
  raw: string
}

/**
 * Parse une chaîne prix en `{ amount, currency, raw }`.
 * - Détecte la devise via symbole ou code ISO.
 * - Gère le format français (`1 299,99 €`) et anglo-saxon (`$1,299.99`).
 * - Retourne null si la chaîne est vide.
 * - Retourne `{ amount: null, currency: 'EUR', raw }` si aucun nombre détectable
 *   (ex: « Sur devis ») — utile pour préserver l'info brute.
 */
export function parsePrice(input: string): ParsedPrice | null {
  const raw = input.trim()
  if (!raw) return null

  let currency = 'EUR'
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(sym)) { currency = code; break }
  }

  // Capture le premier groupe numérique : 1 299,99 | 1,299.99 | 299 | 99.50
  const m = raw.match(/(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/)
  if (!m) return { amount: null, currency, raw }

  let numStr = m[1].replace(/\s/g, '')
  // Si la chaîne contient à la fois des virgules et des points, considérer
  // le dernier comme séparateur décimal et l'autre comme milliers.
  const hasComma = numStr.includes(',')
  const hasDot = numStr.includes('.')
  if (hasComma && hasDot) {
    const lastComma = numStr.lastIndexOf(',')
    const lastDot = numStr.lastIndexOf('.')
    if (lastComma > lastDot) numStr = numStr.replace(/\./g, '').replace(',', '.')
    else numStr = numStr.replace(/,/g, '')
  } else if (hasComma) {
    // Format français : "1299,99" → "1299.99"
    numStr = numStr.replace(',', '.')
  }
  // hasDot only → already correct

  const amount = Number(numStr)
  return { amount: Number.isFinite(amount) ? amount : null, currency, raw }
}
