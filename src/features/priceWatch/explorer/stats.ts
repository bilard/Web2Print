// Statistiques financières du site actif, calculées sur les lignes AFFICHÉES (filtres
// compris) : un filtre qui ne fait pas bouger les chiffres ne sert à rien. PUR.
import { discountPct, type PairedRow } from './pairing'
import type { DoubtReason } from './confidence'

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
  /** Appariements dont la fiabilité n'est PAS acquise (« à vérifier » + « douteux »). */
  suspects: number
  /** Appariements que les PHOTOS contredisent. */
  visualDiff: number
  /** Paires analysées visuellement — la COUVERTURE, sans laquelle `visualDiff` ment :
   *  « 3 désaccords » n'a pas le même sens sur 40 paires jugées que sur 4 000. */
  visualDone: number
  /** Paires qui pourraient l'être (deux visuels présents). */
  visualComparable: number
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  const v = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  return Math.round(v * 10) / 10
}

export function computeStats(
  rows: PairedRow[],
  visualOf?: (url: string) => { verdict: string } | null,
): SiteStats {
  const gaps: number[] = []
  const prices: number[] = []
  const discounts: number[] = []
  let matched = 0, withPrice = 0, cheaper = 0, aligned = 0, dearer = 0, promos = 0, outOfStock = 0
  let suspects = 0
  let visualDiff = 0, visualDone = 0, visualComparable = 0

  for (const r of rows) {
    if (r.source?.images.length && r.listing.image) visualComparable++
    const vis = visualOf?.(r.listing.url)
    if (vis) { visualDone++; if (vis.verdict === 'different') visualDiff++ }
    if (r.source) matched++
    if (r.confidence && r.confidence.band !== 'sure') suspects++
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
    medPriceTtc: median(prices), promos, medDiscountPct: median(discounts), outOfStock, suspects,
    visualDiff, visualDone, visualComparable,
  }
}

/**
 * Répartition des bandes de fiabilité sur TOUTES les lignes du site, filtres compris ou
 * non.
 *
 * ⚠ Calculée sur `rows` et non sur les lignes filtrées, à dessein : elle sert justement à
 * expliquer une liste vidée PAR le filtre de fiabilité. La calculer après filtrage
 * répondrait « 0 douteux » à qui vient de masquer les douteux.
 */
export function countBands(rows: PairedRow[]): { sure: number; check: number; doubt: number } {
  let sure = 0, check = 0, doubt = 0
  for (const r of rows) {
    if (r.confidence?.band === 'sure') sure++
    else if (r.confidence?.band === 'check') check++
    else if (r.confidence?.band === 'doubt') doubt++
  }
  return { sure, check, doubt }
}

/**
 * POURQUOI les appariements douteux le sont — le motif, pas seulement le compte.
 *
 * « 412 douteux » ne se règle pas : on ignore s'il faut corriger le lexique des familles,
 * durcir une nature de preuve, ou cesser de lire les références d'origine. « 380 sur clé
 * d'origine » se règle. Le tri décroissant met en tête ce qui rapporterait le plus à
 * traiter, et rien d'autre n'est à faire du reste.
 *
 * ⚠ Les lignes SÛRES sont exclues : une paire certaine peut porter un doute mineur qui n'a
 * rien coûté à sa bande, et le compter noierait le signal. On mesure ce qui EMPÊCHE, pas ce
 * qui est simplement noté. Une même ligne compte dans chaque motif qui la grève — la somme
 * dépasse donc le nombre de lignes, et c'est voulu : on veut le poids d'un motif, pas une
 * partition.
 */
export function countDoubts(rows: PairedRow[]): Array<{ reason: DoubtReason; count: number }> {
  const by = new Map<DoubtReason, number>()
  for (const r of rows) {
    if (!r.confidence || r.confidence.band === 'sure') continue
    for (const d of r.confidence.doubts) by.set(d, (by.get(d) ?? 0) + 1)
  }
  return [...by.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

/** Ce que le catalogue source porte vraiment. Dit d'un coup d'œil s'il faut relancer
 *  « Comparer catalogue » pour obtenir la taxonomie et les visuels. */
export function countSourceFacts(products: {
  image?: string; taxo?: string[]; description?: string; url?: string
}[]): { products: number; withImage: number; withTaxo: number; withDescription: number; withUrl: number } {
  let withImage = 0, withTaxo = 0, withDescription = 0, withUrl = 0
  for (const p of products) {
    if (p.image) withImage++
    if (p.taxo?.length) withTaxo++
    if (p.description) withDescription++
    if (p.url) withUrl++
  }
  return { products: products.length, withImage, withTaxo, withDescription, withUrl }
}
