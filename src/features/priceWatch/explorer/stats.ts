// Statistiques financières du site actif, calculées sur les lignes AFFICHÉES (filtres
// compris) : un filtre qui ne fait pas bouger les chiffres ne sert à rien. PUR.
import { discountPct, type PairedRow } from './pairing'

export interface SiteStats {
  /** Fiches visibles / collectées. */
  shown: number
  matched: number
  orphans: number
  withPrice: number
  /** Écart MÉDIAN concurrent vs mes prix (cf. `pw` : la moyenne d'un ratio tronqué dérive). */
  medGapPct: number | null
  cheaper: number
  aligned: number
  dearer: number
  /** Prix médian TTC affiché par le concurrent. */
  medPriceTtc: number | null
  promos: number
  medDiscountPct: number | null
  outOfStock: number
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  return Math.round(v * 10) / 10
}

export function computeStats(rows: PairedRow[]): SiteStats {
  const gaps: number[] = []
  const prices: number[] = []
  const discounts: number[] = []
  let matched = 0, withPrice = 0, cheaper = 0, aligned = 0, dearer = 0, promos = 0, outOfStock = 0

  for (const r of rows) {
    if (r.source) matched++
    if (r.cmp.priceHt != null) withPrice++
    if (r.cmp.priceTtc != null) prices.push(r.cmp.priceTtc)
    if (r.listing.availability === 'out-of-stock') outOfStock++
    const d = discountPct(r.listing)
    if (d != null) { promos++; discounts.push(d) }
    const g = r.cmp.deltaPct
    if (g != null) {
      gaps.push(g)
      if (g < -1) cheaper++
      else if (g > 1) dearer++
      else aligned++
    }
  }

  return {
    shown: rows.length, matched, orphans: rows.length - matched, withPrice,
    medGapPct: median(gaps), cheaper, aligned, dearer,
    medPriceTtc: median(prices), promos, medDiscountPct: median(discounts), outOfStock,
  }
}
