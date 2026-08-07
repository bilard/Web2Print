// Synthèse du comparatif catalogue pour le TABLEAU DE BORD. PUR.
//
// Le dashboard ne doit JAMAIS recalculer à partir des lignes brutes (à l'échelle
// 75 000 × N concurrents, c'est le mur mémoire/1 Mo déjà documenté). Ce module
// pré-calcule, au moment de la comparaison, des résumés BORNÉS : KPIs, stats par
// concurrent (≤ N sites), et une liste centrée PRODUIT que la persistance range et
// plafonne. L'alerte reine : « un concurrent est moins cher que moi ».
import { matchProduct, comparePrices, buildLookups, type IndexLookup, type SourceProduct } from './match'
import type { SiteRef } from './matrix'
import type { CompetitorListing } from './prestashop'

// Types internes au module (référencés par les interfaces exportées ci-dessous ;
// non exportés — le dashboard lit ces champs via ProductRow, cf. knip).
type MatchKind = 'exact-ean' | 'exact-ref' | 'origin'
type Stock = 'in-stock' | 'out-of-stock' | 'on-order'

/** Relevé d'UN concurrent pour un produit (structuré, prêt pour la carte produit). */
interface CompetitorCell {
  siteId: string
  domain: string
  name: string
  url: string
  image: string | null
  priceTtc: number | null
  priceHt: number | null
  listPriceTtc: number | null
  /** Écart % du concurrent vs mon prix HT. < 0 = le concurrent est moins cher que moi. */
  gapPct: number | null
  stock: Stock | null
  match: MatchKind
}

/** Un produit apparié à ≥ 1 concurrent, avec ses relevés (centré produit → mobile). */
export interface ProductRow {
  id: string
  name: string
  reference: string | null
  ean: string | null
  famille: string | null
  myPriceHt: number | null
  /** Lien de la fiche produit sur le site de la source (null si non renseigné). */
  sourceUrl: string | null
  competitors: CompetitorCell[]
  /** Écart le plus négatif (concurrent le moins cher face à moi). null si aucun prix. */
  bestGapPct: number | null
  /** Au moins un concurrent est moins cher que moi (hors bande d'alignement). */
  undercut: boolean
}

/**
 * Audit de la donnée COLLECTÉE chez un concurrent (indépendant de l'appariement) :
 * sur l'ensemble des fiches indexées du site, quel pourcentage porte chaque champ
 * attendu. Rend visible « scrape complet » vs « champ manquant » vs « rien collecté ».
 * Taux 0-100 (arrondis, compacts en base).
 */
export interface CompetitorAudit {
  /** Nombre de fiches indexées pour ce site. */
  indexed: number
  pctPrice: number
  pctListPrice: number
  pctStock: number
  pctName: number
  pctImage: number
  pctRef: number
}

export interface CompetitorStat {
  siteId: string
  domain: string
  matched: number
  /** Produits où CE concurrent est moins cher que moi. */
  cheaper: number
  ruptures: number
  /** Écart % MOYEN (concurrent vs moi) sur les produits chiffrés. null si aucun.
   *  ⚠ Conservé pour les rapports déjà persistés et l'historique — ne PAS l'afficher :
   *  cf. `medGapPct`, qui est la statistique de position à présenter. */
  avgGapPct: number | null
  /**
   * Écart % MÉDIAN (concurrent vs moi) sur les produits chiffrés. null si aucun.
   *
   * C'est le chiffre à afficher. La moyenne est structurellement fausse ici : l'écart
   * est un RATIO, non borné vers le haut (un lot de 10 face à votre unité, une variante
   * plus chère mal appariée → +900 %) alors que `comparePrices` REJETTE déjà tout écart
   * sous −60 % comme erreur de parsing. La distribution est donc tronquée d'un seul
   * côté, et la moyenne dérive vers le haut. Relevé en prod : sos-accessoire affichait
   * « +313,7 % » sur 32 produits — 3 valeurs aberrantes suffisent à produire ce chiffre.
   *
   * Agrégé AVANT `rankProducts` (donc sur TOUS les produits appariés) : contrairement
   * aux stats recalculées depuis `products[].competitors[]`, il reste fiable quand le
   * rapport est tronqué à PRODUCT_CAP.
   *
   * FACULTATIF : les rapports persistés AVANT son introduction n'en ont pas — les
   * surfaces d'affichage retombent alors sur `avgGapPct`.
   */
  medGapPct?: number | null
  /** Taux de remplissage des champs sur les fiches collectées (popup d'audit). */
  audit: CompetitorAudit
  /** Durée de moisson (ms) : dernière passe + cumul. Absent si jamais mesuré. */
  harvest?: { lastMs: number; cumulMs: number; progress: number; sweeps: number }
}

/** Médiane d'écarts %, arrondie au dixième. null si aucun écart chiffré. */
function medianPct(gaps: number[]): number | null {
  if (gaps.length === 0) return null
  const s = [...gaps].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(m * 10) / 10
}

/** Taux de remplissage des champs attendus sur les fiches collectées d'un site. */
export function auditListings(listings: CompetitorListing[]): CompetitorAudit {
  const indexed = listings.length
  if (!indexed) return { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 }
  let price = 0, listPrice = 0, stock = 0, name = 0, image = 0, ref = 0
  for (const l of listings) {
    if (l.price != null) price++
    if (l.listPrice != null) listPrice++
    if (l.availability) stock++
    if (l.name && l.name.trim()) name++
    if (l.image) image++
    if (l.ref || l.gtin13) ref++
  }
  const pct = (n: number) => Math.round((n / indexed) * 100)
  return { indexed, pctPrice: pct(price), pctListPrice: pct(listPrice), pctStock: pct(stock), pctName: pct(name), pctImage: pct(image), pctRef: pct(ref) }
}

export interface ReportKpis {
  /** Produits appariés à ≥ 1 concurrent. */
  products: number
  matchedExact: number
  matchedOriginOnly: number
  sites: number
  /** Comparaisons produit×concurrent chiffrées des deux côtés. */
  comparisons: number
  /** Comparaisons où le concurrent est moins cher que moi (alerte). */
  cheaperThanMe: number
  aligned: number
  /** Comparaisons où JE suis moins cher (bon positionnement). */
  dearerThanMe: number
  ruptures: number
  /** Produits dont AU MOINS un concurrent est moins cher que moi. */
  productsUndercut: number
  /**
   * INDICE TARIF base 100 vs la MÉDIANE du marché : médiane, sur les produits chiffrés,
   * de (mon prix ÷ prix médian des concurrents appariés) × 100.
   *   100 = je suis au niveau du marché · 105 = je suis 5 % au-dessus · 95 = 5 % en dessous.
   *
   * ⚠ Calculé ICI, sur le catalogue COMPLET, donc FIABLE — contrairement à toute
   * statistique recalculée par le dashboard depuis `products[]`, plafonné et rangé par
   * écart le plus négatif (cf. en-tête d'analytics.ts).
   *
   * ⚠ Les prix source sont des TARIFS non remisés : c'est un indice de positionnement
   * CATALOGUE, pas un indice net client. Libellé « indice tarif » en UI, jamais « indice
   * de compétitivité ».
   *
   * Médiane des ratios (et non ratio des sommes) : sans volume de ventes, un panier
   * moyen surpondérerait mécaniquement les articles chers. La médiane est l'indice
   * non pondéré robuste aux valeurs aberrantes. Absent des rapports antérieurs.
   */
  priceIndex?: number | null
  /** Même indice, mais vs le MEILLEUR prix marché (le concurrent le moins cher).
   *  Toujours ≥ priceIndex. Mesure l'exposition au discounter, pas au marché médian. */
  priceIndexBest?: number | null
}

export interface CatalogReport {
  kpis: ReportKpis
  byCompetitor: CompetitorStat[]
  /** Tous les produits appariés (la persistance range et plafonne avant écriture). */
  products: ProductRow[]
}

/** Médiane d'une série (null si vide). Robuste aux prix aberrants d'un mauvais parsing.
 *  Exportée : le tableau de bord s'en sert aussi, et deux médianes qui divergeraient
 *  donneraient deux positions de marché contradictoires pour le même relevé. */
export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Indices tarifaires base 100 depuis les produits appariés COMPLETS (cf. ReportKpis).
 * Un produit ne contribue que s'il a mon prix > 0 et au moins un prix concurrent > 0 —
 * un prix nul/absent ferait diverger le ratio.
 */
function priceIndices(rows: ProductRow[]): { priceIndex: number | null; priceIndexBest: number | null } {
  const vsMedian: number[] = []
  const vsBest: number[] = []
  for (const r of rows) {
    if (r.myPriceHt == null || r.myPriceHt <= 0) continue
    const prices = r.competitors.map((c) => c.priceHt).filter((p): p is number => p != null && p > 0)
    if (prices.length === 0) continue
    const mkt = median(prices)
    if (mkt != null && mkt > 0) vsMedian.push((r.myPriceHt / mkt) * 100)
    vsBest.push((r.myPriceHt / Math.min(...prices)) * 100)
  }
  const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)
  return { priceIndex: round(median(vsMedian)), priceIndexBest: round(median(vsBest)) }
}

function matchKindOf(proof: { key: { origin: boolean; kind: string }; evidence: string }): MatchKind {
  if (proof.key.origin) return 'origin'
  if (proof.key.kind === 'ean' || proof.evidence === 'gtin13' || proof.evidence === 'ean-in-url') return 'exact-ean'
  return 'exact-ref'
}

interface BuildReportOptions {
  vatRate?: number
  /** Bande d'indifférence (%) sous laquelle deux prix sont « alignés ». Défaut : 1. */
  alignedPct?: number
  /** Durées de moisson par siteId (dernière passe + cumul), pour l'audit. */
  harvestBySite?: Map<string, { lastMs: number; cumulMs: number; progress: number; sweeps: number }>
  /** Index déjà bâtis (cf. `buildLookups`). Les reconstruire ici doublerait la mémoire. */
  lookups?: Map<string, IndexLookup>
}

/**
 * Construit la synthèse dashboard depuis les produits source + l'index concurrent.
 * Réutilise l'appariement par égalité exacte (matchProduct) et la comparaison de prix
 * (comparePrices) — jamais d'approximation. Structuré centré produit.
 */
export function buildReport(
  products: SourceProduct[],
  sites: SiteRef[],
  indexBySite: Map<string, CompetitorListing[]>,
  opts: BuildReportOptions = {},
): CatalogReport {
  const alignedPct = opts.alignedPct ?? 1
  const lookups = opts.lookups ?? buildLookups(sites, indexBySite)

  const rows: ProductRow[] = []
  const stat = new Map<string, CompetitorStat & { _gapSum: number; _gapN: number; _gaps: number[] }>()
  for (const s of sites) stat.set(s.siteId, { siteId: s.siteId, domain: s.domain, matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, medGapPct: null, audit: auditListings(indexBySite.get(s.siteId) ?? []), harvest: opts.harvestBySite?.get(s.siteId), _gapSum: 0, _gapN: 0, _gaps: [] })

  const kpis: ReportKpis = {
    products: 0, matchedExact: 0, matchedOriginOnly: 0, sites: sites.length,
    comparisons: 0, cheaperThanMe: 0, aligned: 0, dearerThanMe: 0, ruptures: 0, productsUndercut: 0,
  }

  for (const product of products) {
    const cells: CompetitorCell[] = []
    let exactHit = false
    for (const site of sites) {
      const m = matchProduct(product, site.siteId, lookups.get(site.siteId)!)
      if (m.outcome !== 'matched' || !m.listing || !m.proof) continue
      const st = stat.get(site.siteId)!
      st.matched++
      if (!m.proof.key.origin) exactHit = true
      const cmp = comparePrices(product.price, m.listing, { vatRate: opts.vatRate, alignedPct })
      const gap = cmp.deltaPct ?? null
      const stock = cmp.availability ?? null
      if (stock === 'out-of-stock') { st.ruptures++; kpis.ruptures++ }
      if (gap != null) {
        kpis.comparisons++
        st._gapSum += gap; st._gapN++; st._gaps.push(gap)
        if (gap < -alignedPct) { kpis.cheaperThanMe++; st.cheaper++ }
        else if (gap > alignedPct) kpis.dearerThanMe++
        else kpis.aligned++
      }
      cells.push({
        siteId: site.siteId, domain: site.domain, name: m.listing.name, url: m.listing.url,
        image: m.listing.image ?? null,
        priceTtc: cmp.priceTtc ?? null, priceHt: cmp.priceHt ?? null, listPriceTtc: cmp.listPriceTtc ?? null,
        gapPct: gap, stock, match: matchKindOf(m.proof),
      })
    }
    if (cells.length === 0) continue

    const gaps = cells.map((c) => c.gapPct).filter((g): g is number => g != null)
    const bestGapPct = gaps.length ? Math.min(...gaps) : null
    const undercut = bestGapPct != null && bestGapPct < -alignedPct
    kpis.products++
    if (exactHit) kpis.matchedExact++; else kpis.matchedOriginOnly++
    if (undercut) kpis.productsUndercut++
    rows.push({
      id: product.id, name: product.name,
      reference: product.ref ?? null, ean: product.ean ?? null,
      famille: (product as SourceProduct & { family?: string }).family ?? null,
      myPriceHt: product.price ?? null,
      sourceUrl: product.url ?? null,
      competitors: cells, bestGapPct, undercut,
    })
  }

  // Indices tarifaires : calculés sur `rows` COMPLET, avant tout classement/plafond.
  const { priceIndex, priceIndexBest } = priceIndices(rows)
  kpis.priceIndex = priceIndex
  kpis.priceIndexBest = priceIndexBest

  const byCompetitor: CompetitorStat[] = [...stat.values()].map((s) => ({
    siteId: s.siteId, domain: s.domain, matched: s.matched, cheaper: s.cheaper, ruptures: s.ruptures,
    avgGapPct: s._gapN ? Math.round((s._gapSum / s._gapN) * 10) / 10 : null,
    medGapPct: medianPct(s._gaps),
    audit: s.audit,
    ...(s.harvest ? { harvest: s.harvest } : {}),
  }))

  return { kpis, byCompetitor, products: rows }
}

/** Range les produits par écart le plus négatif (les plus « sous-cotés » d'abord). */
export function rankProducts(rows: ProductRow[]): ProductRow[] {
  return [...rows].sort((a, b) => {
    const av = a.bestGapPct ?? Infinity
    const bv = b.bestGapPct ?? Infinity
    return av - bv
  })
}
