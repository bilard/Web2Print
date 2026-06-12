/**
 * Réconcilie prix de vente et prix barré d'une page produit.
 *
 * Le JSON-LD `offers.price` n'est PAS toujours le prix de vente courant :
 * certains sites (ex. promos Jardiland) y laissent le prix AVANT remise, le
 * prix réellement payé ne vivant que dans le markup. On croise donc :
 *   - le prix barré du markup (`<del>`/`<s>`, classes old/barré/strike…)
 *   - le badge de remise (« -24,50 € ») ou un prix inférieur à proximité
 * Heuristiques génériques, aucune règle par enseigne.
 */

export interface PromoPricing {
  /** Prix de vente courant (celui réellement payé). */
  selling: number
  /** Prix barré / avant promo — absent hors promo. */
  original?: number
}

const NUM_RE = String.raw`\d{1,3}(?:[ \u00a0\u202f.]\d{3})*(?:[.,]\d{1,2})?`

/** Conteneurs probables de prix barré : balises sémantiques ou classes-indices. */
const CONTAINER_RES = [
  /<(?:del|s)\b[^>]*>([\s\S]{0,120}?)<\/(?:del|s)>/gi,
  /<[^>]+class="[^"]*(?:old|barr|strike|was[-_]|regular[-_]|crossed|initial|avant)[^"]*"[^>]*>([\s\S]{0,120}?)<\//gi,
]

function toNumber(s: string): number {
  return Number(s.replace(/[ \u00a0\u202f]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
}

/** Premier prix barré trouvé dans le markup, avec sa position. */
function findCrossedPrice(html: string): { value: number; index: number } | null {
  const priceRe = new RegExp(`(${NUM_RE})\\s?€|€\\s?(${NUM_RE})`, 'i')
  for (const containerRe of CONTAINER_RES) {
    containerRe.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = containerRe.exec(html)) !== null) {
      const text = m[1].replace(/<[^>]+>/g, ' ')
      const p = text.match(priceRe)
      if (!p) continue
      const value = toNumber(p[1] ?? p[2])
      if (Number.isFinite(value) && value > 0) return { value, index: m.index }
    }
  }
  return null
}

/** Prix de vente + barré réconciliés depuis le HTML et le prix JSON-LD. */
export function parsePromoPricing(html: string, jsonLdPrice: number): PromoPricing {
  const crossed = findCrossedPrice(html)
  if (!crossed) return { selling: jsonLdPrice }

  // Cas nominal : JSON-LD = prix promo courant, barré supérieur dans le markup.
  if (crossed.value > jsonLdPrice + 0.01) {
    return { selling: jsonLdPrice, original: crossed.value }
  }

  // Barré ≈ JSON-LD : le JSON-LD porte le prix AVANT promo. Le prix payé est
  // dans le markup, après le barré.
  if (Math.abs(crossed.value - jsonLdPrice) <= 0.01) {
    const win = html.slice(crossed.index, crossed.index + 800)
    // 1. Badge de remise « -24,50 € » → vente = barré − remise
    const disc = win.match(new RegExp(`[-−–]\\s?(${NUM_RE})\\s?€`))
    if (disc) {
      const d = toNumber(disc[1])
      if (d > 0 && d < crossed.value) {
        return { selling: Math.round((crossed.value - d) * 100) / 100, original: crossed.value }
      }
    }
    // 2. Premier prix strictement inférieur à proximité (hors montants négatifs)
    const priceRe = new RegExp(`(${NUM_RE})\\s?€|€\\s?(${NUM_RE})`, 'gi')
    let m: RegExpExecArray | null
    while ((m = priceRe.exec(win)) !== null) {
      const before = win.slice(Math.max(0, m.index - 2), m.index)
      if (/[-−–]\s?$/.test(before)) continue
      const v = toNumber(m[1] ?? m[2])
      if (Number.isFinite(v) && v > 0 && v < crossed.value - 0.01) {
        return { selling: v, original: crossed.value }
      }
    }
    return { selling: jsonLdPrice }
  }

  // Barré < JSON-LD : faux positif (prix au litre, mensualité…) — on l'ignore.
  return { selling: jsonLdPrice }
}
