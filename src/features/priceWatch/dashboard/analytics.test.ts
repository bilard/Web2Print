import { describe, it, expect } from 'vitest'
import type { StoredReport } from '../reportStore'
import type { KpiHistoryPoint } from '../types'
import { buildCockpit, buildLinkIndex, buildTableRows, rowsToCsv, filterProducts, sparkSeries, competitorSeries, priceIndexSeries, comparableTail, trendDelta, EMPTY_FILTER, matchesQuery, groupRowsByFamily, type TableRow } from './analytics'

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
    { siteId: 'a', domain: 'a.com', matched: 3, cheaper: 2, ruptures: 1, avgGapPct: -20, audit: { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 } },
    { siteId: 'b', domain: 'b.com', matched: 2, cheaper: 1, ruptures: 0, avgGapPct: 5, audit: { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 } },
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

  it('scatter : le domaine est celui qui PORTE l’écart affiché (min gapPct)', () => {
    const ck = buildCockpit(report)
    // P1 : a.com à -20 % et b.com à +5 % → l'écart du point vient de a.com.
    expect(ck.scatter[0]).toMatchObject({ y: -20, domain: 'a.com' })
    // P3 : un seul concurrent chiffré.
    expect(ck.scatter[2]).toMatchObject({ y: 10, domain: 'b.com' })
  })
})

describe('séries temporelles', () => {
  // `pi` présent = point écrit APRÈS l'assainissement de l'axe temps, donc issu d'une
  // analyse COMPLÈTE. C'est ce que les courbes tracent.
  const history: KpiHistoryPoint[] = [
    { at: 1, products: 3, cheaperThanMe: 3, dearerThanMe: 1, aligned: 0, productsUndercut: 2, pi: 104, comp: [{ s: 'a', g: -18 }, { s: 'b', g: 4 }] },
    { at: 2, products: 3, cheaperThanMe: 2, dearerThanMe: 2, aligned: 0, productsUndercut: 2, pi: 101, comp: [{ s: 'a', g: -22 }] },
  ]

  it('competitorSeries : une série par site, null = trou (jamais 0)', () => {
    const { at, series } = competitorSeries(history, report.sites)
    expect(at).toEqual([1, 2])
    const a = series.find((s) => s.siteId === 'a')!
    const b = series.find((s) => s.siteId === 'b')!
    expect(a.points).toEqual([-18, -22])
    expect(b.points).toEqual([4, null]) // absent du 2e point → trou
  })

  it('competitorSeries écarte les points ANTÉRIEURS à l’assainissement (sans `pi`)', () => {
    // Ces points-là provenaient en majorité de recalculs partiels relancés toutes les
    // 4 min pendant une moisson : l'écart moyen y bougeait parce que l'index grossissait.
    const pollué: KpiHistoryPoint[] = [
      { at: 0, products: 1, cheaperThanMe: 0, dearerThanMe: 0, aligned: 0, productsUndercut: 0, comp: [{ s: 'a', g: -99 }] },
      ...history,
    ]
    expect(competitorSeries(pollué, report.sites).at).toEqual([1, 2])
  })

  it('priceIndexSeries : ne remonte que les points portant l’indice', () => {
    const mixte: KpiHistoryPoint[] = [
      { at: 0, products: 1, cheaperThanMe: 0, dearerThanMe: 0, aligned: 0, productsUndercut: 0 },
      ...history,
    ]
    expect(priceIndexSeries(mixte)).toEqual({ at: [1, 2], values: [104, 101] })
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

  it('CSV : colonnes de liens en FIN de ligne (fiche source + une par concurrent)', () => {
    const linked = buildTableRows([{
      ...report.products[0], sourceUrl: 'https://moi.fr/p1',
      competitors: [{ ...report.products[0].competitors[0], url: 'https://a.com/p1' }],
    }])
    const lines = rowsToCsv(linked, report.sites).split('\n')
    // Les colonnes chiffrées gardent leur index : 'Référence' reste en tête.
    expect(lines[0].split(';').slice(0, 2)).toEqual(['Référence', 'EAN'])
    expect(lines[0].split(';').slice(-3)).toEqual(['Fiche source', 'a.com (lien)', 'b.com (lien)'])
    expect(lines[1].split(';').slice(-3)).toEqual(['https://moi.fr/p1', 'https://a.com/p1', ''])
  })
})

describe('buildLinkIndex — pages scrapées adressables par identifiant', () => {
  it('indexe la fiche source par produit et la fiche relevée par (produit, site)', () => {
    const idx = buildLinkIndex([{
      ...report.products[0], sourceUrl: 'https://moi.fr/p1',
      competitors: [
        { ...report.products[0].competitors[0], url: 'https://a.com/p1' },
        { ...report.products[0].competitors[1], url: 'https://b.com/p1' },
      ],
    }])
    expect(idx.source.get('1')).toBe('https://moi.fr/p1')
    expect(idx.competitor.get('1|a')).toBe('https://a.com/p1')
    expect(idx.competitor.get('1|b')).toBe('https://b.com/p1')
  })

  it("n'invente jamais d'entrée : URL vide ou produit hors rapport → absent", () => {
    // La fixture a `url: ''` partout et `sourceUrl: null` : rien ne doit être indexé.
    const idx = buildLinkIndex(report.products)
    expect(idx.source.size).toBe(0)
    expect(idx.competitor.size).toBe(0)
    expect(idx.competitor.get('999|a')).toBeUndefined()
  })
})

describe('matchesQuery — recherche full-text insensible aux accents', () => {
  const p = { name: 'COURROIE CRANTÉE 5/8', reference: '5304753', ean: '4049582968960', famille: 'ÉLECTRICITÉ' }
  it('matche sans accents ni casse', () => {
    expect(matchesQuery(p, 'crantee')).toBe(true)
    expect(matchesQuery(p, 'electricite')).toBe(true)
  })
  it('multi-mots : CHAQUE mot doit se retrouver quelque part', () => {
    expect(matchesQuery(p, 'courroie 5304')).toBe(true)
    expect(matchesQuery(p, 'courroie inexistant')).toBe(false)
  })
  it('réf et EAN sont cherchables ; requête vide matche tout', () => {
    expect(matchesQuery(p, '404958')).toBe(true)
    expect(matchesQuery(p, '  ')).toBe(true)
  })
})

describe('groupRowsByFamily — groupes triés alphabétiquement', () => {
  const mk = (id: string, famille: string | null): TableRow =>
    ({ id, name: id, reference: null, ean: null, famille, myPriceHt: 1, bestGapPct: null, tone: null,
       sourceUrl: null, gapBySite: {}, priceBySite: {}, ttcBySite: {}, urlBySite: {} }) as unknown as TableRow
  it('familles en ordre alphabétique, ordre des lignes préservé dans chaque groupe', () => {
    const groups = groupRowsByFamily([mk('p1', 'Moteur'), mk('p2', 'Courroies'), mk('p3', 'Moteur'), mk('p4', null)])
    expect(groups.map((g) => g.famille)).toEqual(['Autres', 'Courroies', 'Moteur'])
    expect(groups[2].rows.map((r) => r.id)).toEqual(['p1', 'p3'])
  })
})

describe('comparabilité des analyses (périmètre)', () => {
  const pt = (at: number, products: number, undercut = 0): KpiHistoryPoint => ({
    at, products, cheaperThanMe: 0, dearerThanMe: 0, aligned: 0, productsUndercut: undercut,
  })

  it('coupe la série quand le catalogue change d’ordre de grandeur', () => {
    // Cas réel : 20 856 produits analysés, puis 72. La variation affichée était
    // « ▼20 784 » — exacte, et parfaitement trompeuse : elle mesurait le
    // changement de périmètre, pas les prix.
    const history = [pt(1, 20856, 7891), pt(2, 72, 5)]
    expect(comparableTail(history)).toEqual([pt(2, 72, 5)])
    expect(trendDelta(history)).toBeNull()
  })

  it('garde la comparaison quand le catalogue évolue normalement', () => {
    const history = [pt(1, 70, 4), pt(2, 72, 5)]
    expect(trendDelta(history)).toEqual({ prev: pt(1, 70, 4), last: pt(2, 72, 5) })
  })

  it('tolère une croissance jusqu’à un facteur 2', () => {
    expect(comparableTail([pt(1, 50), pt(2, 100)])).toHaveLength(2)
    expect(comparableTail([pt(1, 49), pt(2, 100)])).toHaveLength(1)
  })

  it('ne remonte pas AU-DELÀ d’une rupture, même si des points anciens sont proches', () => {
    // 72 → 20000 → 72 : le point le plus ancien redevient comparable en valeur,
    // mais la série est rompue entre-temps. La reprendre lisserait le trou.
    const history = [pt(1, 72), pt(2, 20000), pt(3, 72)]
    expect(comparableTail(history)).toEqual([pt(3, 72)])
  })

  it('les sparklines suivent le même périmètre que les variations', () => {
    const s = sparkSeries([pt(1, 20856, 7891), pt(2, 72, 5)])
    expect(s.products).toEqual([72])
    expect(s.undercut).toEqual([5])
  })
})
