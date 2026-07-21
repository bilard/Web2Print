// src/features/priceWatch/dashboard/analytics.test.ts
import { describe, it, expect } from 'vitest'
import type { StoredReport } from '../reportStore'
import type { KpiHistoryPoint } from '../reportStore'
import { buildCockpit, buildTableRows, rowsToCsv, filterProducts, sparkSeries, competitorSeries, EMPTY_FILTER } from './analytics'

const cell = (siteId: string, domain: string, priceHt: number, gapPct: number, stock: 'in-stock' | 'out-of-stock' = 'in-stock') => ({
  siteId, domain, name: 'x', url: '', image: null,
  priceTtc: null, priceHt, listPriceTtc: null, gapPct, stock, match: 'exact-ean' as const,
})

const report: StoredReport = {
  runAt: 1000,
  kpis: {
    products: 3, matchedExact: 2, matchedOriginOnly: 1, sites: 2,
    comparisons: 4, cheaperThanMe: 3, aligned: 0, dearerThanMe: 1, ruptures: 1, productsUndercut: 2,
  },
  byCompetitor: [
    { siteId: 'a', domain: 'a.com', matched: 3, cheaper: 2, ruptures: 1, avgGapPct: -20 },
    { siteId: 'b', domain: 'b.com', matched: 2, cheaper: 1, ruptures: 0, avgGapPct: 5 },
  ],
  sites: [{ siteId: 'a', domain: 'a.com' }, { siteId: 'b', domain: 'b.com' }],
  products: [
    { id: '1', name: 'P1', reference: 'R1', ean: null, famille: 'F1', myPriceHt: 100, bestGapPct: -20, undercut: true, sourceUrl: null, competitors: [cell('a', 'a.com', 80, -20, 'out-of-stock'), cell('b', 'b.com', 105, 5)] },
    { id: '2', name: 'P2', reference: 'R2', ean: null, famille: 'F1', myPriceHt: 50, bestGapPct: -20, undercut: true, sourceUrl: null, competitors: [cell('a', 'a.com', 40, -20)] },
    { id: '3', name: 'P3', reference: 'R3', ean: null, famille: null, myPriceHt: 30, bestGapPct: 10, undercut: false, sourceUrl: null, competitors: [cell('b', 'b.com', 33, 10)] },
  ],
  totalMatched: 3,
  truncated: false,
}

describe('buildCockpit', () => {
  const ck = buildCockpit(report)

  it('métriques headline depuis kpis (non biaisées)', () => {
    expect(ck.priceHoldPct).toBe(25) // (0 aligné + 1 dearer) / 4 comparaisons
    expect(Math.round(ck.exposedPct!)).toBe(67) // 2/3 produits sous-cotés
  })

  it('concurrents triés par agressivité (avgGap asc) + cheaperRate', () => {
    expect(ck.competitors.map((c) => c.siteId)).toEqual(['a', 'b'])
    expect(ck.competitors[0].cheaperRate).toBeCloseTo(2 / 3)
    expect(ck.competitors[0].medianGapPct).toBe(-20) // [-20,-20]
  })

  it('médiane globale des écarts sur toutes les paires', () => {
    expect(ck.medianGapPct).toBe(-7.5) // median([-20,5,-20,10])
  })

  it('opportunités triées par impact € (mon prix − meilleur prix concurrent)', () => {
    expect(ck.opportunities.map((o) => o.id)).toEqual(['1', '2'])
    expect(ck.opportunities[0].gapEur).toBe(20) // 100 - 80
    expect(ck.totalGapEur).toBe(30) // 20 + 10
  })

  it('heatmap concurrent × famille = moyenne des écarts', () => {
    expect(ck.heatmap['a']['F1'].avgGapPct).toBe(-20)
    expect(ck.familyKeys).toContain('F1')
  })

  it('histogramme range les écarts par tranche', () => {
    const b = Object.fromEntries(ck.histogram.map((h) => [h.label, h.count]))
    expect(b['-30 à -20%']).toBe(2)
    expect(b['3 à 10%']).toBe(2)
  })
})

describe('filtre global', () => {
  it('filterProducts par position / famille / recherche / concurrent', () => {
    expect(filterProducts(report.products, { ...EMPTY_FILTER, position: 'cheaper' }).map((p) => p.id)).toEqual(['1', '2'])
    expect(filterProducts(report.products, { ...EMPTY_FILTER, position: 'dearer' }).map((p) => p.id)).toEqual(['3'])
    expect(filterProducts(report.products, { ...EMPTY_FILTER, famille: 'F1' })).toHaveLength(2)
    expect(filterProducts(report.products, { ...EMPTY_FILTER, q: 'P1' })).toHaveLength(1)
    // concurrent 'b' apparié aux produits 1 et 3
    expect(filterProducts(report.products, { ...EMPTY_FILTER, competitor: 'b' }).map((p) => p.id)).toEqual(['1', '3'])
  })

  it('buildCockpit filtré : blocs dérivés réduits, headline global inchangé', () => {
    const full = buildCockpit(report)
    const filtered = buildCockpit(report, { ...EMPTY_FILTER, famille: 'F1' })
    expect(filtered.filterActive).toBe(true)
    expect(filtered.filteredCount).toBe(2)
    expect(filtered.scatter).toHaveLength(2)
    // headline identiques (jamais filtrés)
    expect(filtered.priceHoldPct).toBe(full.priceHoldPct)
    expect(filtered.exposedPct).toBe(full.exposedPct)
  })

  it('scatter = un point par produit chiffré (prix × meilleur écart)', () => {
    const ck = buildCockpit(report)
    expect(ck.scatter).toHaveLength(3)
    expect(ck.scatter[0]).toMatchObject({ x: 100, y: -20, tone: 'cheaper' })
  })
})

describe('séries temporelles', () => {
  const history: KpiHistoryPoint[] = [
    { at: 1, products: 3, cheaperThanMe: 3, dearerThanMe: 1, aligned: 0, productsUndercut: 2, comp: [{ s: 'a', g: -18 }, { s: 'b', g: 4 }] },
    { at: 2, products: 3, cheaperThanMe: 2, dearerThanMe: 2, aligned: 0, productsUndercut: 2, comp: [{ s: 'a', g: -22 }] },
  ]

  it('competitorSeries : une série par site, null = trou (jamais 0)', () => {
    const { at, series } = competitorSeries(history, report.sites)
    expect(at).toEqual([1, 2])
    const a = series.find((s) => s.siteId === 'a')!
    const b = series.find((s) => s.siteId === 'b')!
    expect(a.points).toEqual([-18, -22])
    expect(b.points).toEqual([4, null]) // absent du 2e point → trou
  })

  it('sparkSeries : dérive tenue/exposés/appariés des points', () => {
    const s = sparkSeries(history)
    expect(s.undercut).toEqual([2, 2])
    expect(s.products).toEqual([3, 3])
    expect(s.hold[0]).toBe(25) // (0+1)/(0+1+3)
  })
})

describe('buildTableRows + rowsToCsv', () => {
  const rows = buildTableRows(report.products)

  it('une ligne par produit avec écart par concurrent', () => {
    expect(rows).toHaveLength(3)
    expect(rows[0].gapBySite['a']).toBe(-20)
    expect(rows[0].gapBySite['b']).toBe(5)
    expect(rows[2].gapBySite['a']).toBeUndefined()
  })

  it('CSV : en-tête + une ligne par produit, séparateur ;', () => {
    const csv = rowsToCsv(rows, report.sites)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(4) // header + 3
    expect(lines[0]).toContain('a.com (prix HT)')
    expect(lines[1].split(';')[0]).toBe('R1')
  })
})
