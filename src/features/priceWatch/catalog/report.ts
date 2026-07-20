// src/features/priceWatch/catalog/report.ts
// Synthèse du comparatif catalogue pour le TABLEAU DE BORD. PUR.
//
// Le dashboard ne doit JAMAIS recalculer à partir des lignes brutes (à l'échelle
// 75 000 × N concurrents, c'est le mur mémoire/1 Mo déjà documenté). Ce module
// pré-calcule, au moment de la comparaison, des résumés BORNÉS : KPIs, stats par
// concurrent (≤ N sites), et une liste centrée PRODUIT que la persistance range et
// plafonne. L'alerte reine : « un concurrent est moins cher que moi ».
import { matchProduct, comparePrices, buildMemoryIndex, type SourceProduct } from './match'
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
  competitors: CompetitorCell[]
  /** Écart le plus négatif (concurrent le moins cher face à moi). null si aucun prix. */
  bestGapPct: number | null
  /** Au moins un concurrent est moins cher que moi (hors bande d'alignement). */
  undercut: boolean
}

export interface CompetitorStat {
  siteId: string
  domain: string
  matched: number
  /** Produits où CE concurrent est moins cher que moi. */
  cheaper: number
  ruptures: number
  /** Écart % moyen (concurrent vs moi) sur les produits chiffrés. null si aucun. */
  avgGapPct: number | null
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
}

export interface CatalogReport {
  kpis: ReportKpis
  byCompetitor: CompetitorStat[]
  /** Tous les produits appariés (la persistance range et plafonne avant écriture). */
  products: ProductRow[]
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
  const lookups = new Map(sites.map((s) => [s.siteId, buildMemoryIndex(indexBySite.get(s.siteId) ?? [])]))

  const rows: ProductRow[] = []
  const stat = new Map<string, CompetitorStat & { _gapSum: number; _gapN: number }>()
  for (const s of sites) stat.set(s.siteId, { siteId: s.siteId, domain: s.domain, matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, _gapSum: 0, _gapN: 0 })

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
        st._gapSum += gap; st._gapN++
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
      competitors: cells, bestGapPct, undercut,
    })
  }

  const byCompetitor: CompetitorStat[] = [...stat.values()].map((s) => ({
    siteId: s.siteId, domain: s.domain, matched: s.matched, cheaper: s.cheaper, ruptures: s.ruptures,
    avgGapPct: s._gapN ? Math.round((s._gapSum / s._gapN) * 10) / 10 : null,
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
