/**
 * Extrait le prix barré (prix d'origine avant promo) du HTML d'une page produit.
 * Le JSON-LD Schema.org ne porte quasiment jamais le prix d'origine — il vit
 * dans le markup : balises `<del>`/`<s>` ou classes `price--old`, `was-price`,
 * `prix-barre`… Heuristiques génériques, aucune règle par enseigne.
 */

const NUM_RE = String.raw`\d{1,3}(?:[ \u00a0\u202f.]\d{3})*(?:[.,]\d{1,2})?`
const PRICE_RE = new RegExp(`(${NUM_RE})\\s?€|€\\s?(${NUM_RE})`, 'i')

/** Conteneurs probables de prix barré : balises sémantiques ou classes-indices. */
const CONTAINER_RES = [
  /<(?:del|s)\b[^>]*>([\s\S]{0,120}?)<\/(?:del|s)>/gi,
  /<[^>]+class="[^"]*(?:old|barr|strike|was[-_]|regular[-_]|crossed|initial|avant)[^"]*"[^>]*>([\s\S]{0,120}?)<\//gi,
]

function toNumber(s: string): number {
  return Number(s.replace(/[ \u00a0\u202f.](?=\d{3})/g, '').replace(',', '.'))
}

/** Prix barré trouvé dans le HTML, ou null. Si `sellingPrice` est fourni, seul
 *  un prix STRICTEMENT supérieur est plausible (un barré ≤ prix de vente est
 *  un faux positif : prix unitaire, mensualité…). */
export function parseOriginalPriceFromHtml(html: string, sellingPrice?: number): number | null {
  for (const containerRe of CONTAINER_RES) {
    containerRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = containerRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ')
      const p = text.match(PRICE_RE)
      if (!p) continue
      const value = toNumber(p[1] ?? p[2])
      if (!Number.isFinite(value) || value <= 0) continue
      if (sellingPrice != null && value <= sellingPrice) continue
      return value
    }
  }
  return null
}
