import { describe, it, expect } from 'vitest'
import type { CompetitorStat } from '@/features/priceWatch/catalog/report'
import type { SourceProduct } from '@/features/priceWatch/catalog/match'
import type { CompetitorListing } from '@/features/priceWatch/catalog/competitorListing'
import { aggregate } from '../engine/aggregate'
import {
  summaryRows, catalogRows, listingRows,
  watchSummarySource, watchCatalogSource, watchSiteSource,
} from './watch.source'

const audit = (indexed: number, pctPrice: number) => ({
  indexed, pctPrice, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0,
})

const stat = (over: Partial<CompetitorStat> = {}): CompetitorStat => ({
  siteId: 'a', domain: 'a.fr', matched: 10, cheaper: 4, ruptures: 1,
  avgGapPct: 30, medGapPct: -5, audit: audit(100, 80), ...over,
})

describe('summaryRows', () => {
  it('rend une ligne par concurrent, avec les chiffres du rapport', () => {
    const [row] = summaryRows([stat()])
    expect(row).toMatchObject({
      siteId: 'a', domain: 'a.fr', matched: 10, cheaper: 4, ruptures: 1,
      medGapPct: -5, indexed: 100, pctPrice: 80,
    })
  })

  it('retombe sur la moyenne quand le rapport est antérieur à la médiane', () => {
    // Les rapports persistés avant `medGapPct` ne portent que `avgGapPct` : sans ce repli,
    // toute une colonne du tableau serait vide pour les suivis anciens.
    expect(summaryRows([stat({ medGapPct: undefined })])[0].medGapPct).toBe(30)
  })

  it('laisse l’écart ABSENT plutôt que de le poser à zéro', () => {
    // ⚠⚠ Un 0 % se lirait « aligné sur le marché » — le contraire de « aucun prix comparé ».
    expect(summaryRows([stat({ medGapPct: null, avgGapPct: null })])[0].medGapPct).toBeNull()
  })

  it('totalise appariés et moins chers par concurrent', () => {
    const rows = summaryRows([stat(), stat({ siteId: 'b', domain: 'b.fr', matched: 5, cheaper: 1 })])
    const res = aggregate(rows, {
      source: 'watch.summary',
      measures: [{ id: 'watch.matched' }, { id: 'watch.cheaper' }],
      dimensions: [{ id: 'domain' }], filters: [],
    }, watchSummarySource)
    expect(res.rows).toEqual([
      { domain: 'a.fr', 'watch.matched': 10, 'watch.cheaper': 4 },
      { domain: 'b.fr', 'watch.matched': 5, 'watch.cheaper': 1 },
    ])
  })

  it('⚠⚠ ne rend AUCUN écart quand aucun prix n’a été comparé', () => {
    // Un `0` se lirait « aligné sur le marché » : la tuile doit afficher « — ».
    const rows = summaryRows([stat({ medGapPct: null, avgGapPct: null })])
    const res = aggregate(rows, {
      source: 'watch.summary', measures: [{ id: 'watch.medGap' }], dimensions: [], filters: [],
    }, watchSummarySource)
    expect(res.rows).toEqual([{ 'watch.medGap': null }])
  })

  it('pondère la part de fiches avec prix par le nombre de fiches indexées', () => {
    // Une moyenne simple donnerait 50 % : le petit concurrent pèserait autant que le gros.
    const rows = summaryRows([
      stat({ siteId: 'a', audit: audit(100, 100) }),
      stat({ siteId: 'b', domain: 'b.fr', audit: audit(900, 0) }),
    ])
    const res = aggregate(rows, {
      source: 'watch.summary', measures: [{ id: 'watch.pctPrice' }], dimensions: [], filters: [],
    }, watchSummarySource)
    expect(res.rows).toEqual([{ 'watch.pctPrice': 10 }])
  })

  it('compte les concurrents sans dimension', () => {
    const rows = summaryRows([stat(), stat({ siteId: 'b', domain: 'b.fr' })])
    const res = aggregate(rows, {
      source: 'watch.summary', measures: [{ id: 'count' }], dimensions: [], filters: [],
    }, watchSummarySource)
    expect(res.rows).toEqual([{ count: 2 }])
  })
})

const product = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'p1', name: 'Filtre à air', ref: 'F-123', price: 12.5,
  taxo: ['Filtration', 'Air', 'Cartouches'], ...over,
})

describe('catalogRows', () => {
  it('éclate la taxonomie en trois dimensions et garde le prix', () => {
    const [row] = catalogRows([product()])
    expect(row).toMatchObject({
      name: 'Filtre à air', ref: 'F-123', price: 12.5,
      famille: 'Filtration', sousFamille: 'Air', groupe: 'Cartouches',
      hasPrice: true, hasRef: true,
    })
  })

  it('laisse le prix ABSENT quand la source n’en porte pas', () => {
    // Un 0 € entrerait dans les moyennes et les médianes : la fiche sans prix pèserait.
    const [row] = catalogRows([product({ price: undefined })])
    expect(row.price).toBeNull()
    expect(row.hasPrice).toBe(false)
  })

  it('ne pose aucun niveau de taxonomie absent', () => {
    const [row] = catalogRows([product({ taxo: ['Filtration'] })])
    expect(row.famille).toBe('Filtration')
    expect(row.sousFamille).toBeNull()
    expect(row.groupe).toBeNull()
  })

  it('reconnaît le code-barres comme référence', () => {
    const [row] = catalogRows([product({ ref: undefined, ean: '3245678901234' })])
    expect(row.hasRef).toBe(true)
  })
})

const listing = (over: Partial<CompetitorListing> = {}): CompetitorListing => ({
  url: 'https://a.fr/p/1', name: 'Filtre à air', price: 19.9, ...over,
})

describe('listingRows', () => {
  it('rend les champs de la fiche collectée', () => {
    const [row] = listingRows([listing({ listPrice: 24.9, availability: 'in-stock', seller: 'Ets Dupont' })])
    expect(row).toMatchObject({
      name: 'Filtre à air', price: 19.9, listPrice: 24.9,
      availability: 'in-stock', seller: 'Ets Dupont', hasPrice: true,
    })
  })

  it('laisse la disponibilité ABSENTE quand le site ne la déclare pas', () => {
    // « Non déclaré » n'est pas « en stock » : le groupe des absents doit rester à part.
    expect(listingRows([listing()])[0].availability).toBeNull()
  })

  it('compte les fiches collectées par disponibilité', () => {
    const rows = listingRows([
      listing({ availability: 'in-stock' }), listing({ availability: 'in-stock' }),
      listing({ availability: 'out-of-stock' }),
    ])
    const res = aggregate(rows, {
      source: 'watch.site', measures: [{ id: 'count' }],
      dimensions: [{ id: 'availability' }], filters: [],
    }, watchSiteSource)
    expect(res.rows).toEqual([
      { availability: 'in-stock', count: 2 },
      { availability: 'out-of-stock', count: 1 },
    ])
  })
})

describe('contrat des sources', () => {
  // ⚠⚠ Ces identifiants sont PERSISTÉS dans les `QuerySpec` enregistrées : les renommer
  // casserait toutes les tuiles déjà posées, sans un mot à l'écran.
  it('fige les identifiants de dimension', () => {
    expect(watchSummarySource.dimensions.map((d) => d.id)).toEqual([
      'domain', 'medGapPct', 'pctPrice',
    ])
    expect(watchCatalogSource.dimensions.map((d) => d.id)).toEqual([
      'famille', 'sousFamille', 'groupe', 'name', 'ref', 'ref2', 'ean', 'price',
      'hasPrice', 'hasRef',
    ])
    expect(watchSiteSource.dimensions.map((d) => d.id)).toEqual([
      'name', 'ref', 'ean', 'price', 'listPrice', 'discountPct', 'availability',
      'seller', 'hasPrice', 'hasRef',
    ])
  })

  it('⚠⚠ marque médiane et pourcentage NON agrégeables', () => {
    // Sans ce drapeau, une tuile totaliserait vingt-quatre écarts médians et afficherait
    // « −312 % ». C'est `AggregateResult.aggregable` qui l'en empêche, et il vient d'ici.
    const nonAggregable = watchSummarySource.measures.filter((m) => !m.aggregable).map((m) => m.id)
    expect(nonAggregable).toEqual(['watch.medGap', 'watch.pctPrice'])
    expect(watchCatalogSource.measures.find((m) => m.id === 'watch.medianPrice')?.aggregable).toBe(false)
  })

  it('tourne en mémoire (moteur client) tant que le lot 3 n’est pas là', () => {
    expect(watchSummarySource.engine).toBe('client')
    expect(watchCatalogSource.engine).toBe('client')
    expect(watchSiteSource.engine).toBe('client')
  })
})
