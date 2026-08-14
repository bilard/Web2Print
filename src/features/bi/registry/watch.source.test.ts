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

  it('rend TOUT l’audit des fiches collectées, pas seulement le taux de prix', () => {
    const [row] = summaryRows([stat({
      audit: { indexed: 40, pctPrice: 80, pctListPrice: 10, pctStock: 55, pctName: 100, pctImage: 90, pctRef: 70 },
    })])
    expect(row).toMatchObject({
      indexed: 40, pctPrice: 80, pctListPrice: 10, pctStock: 55, pctName: 100, pctImage: 90, pctRef: 70,
    })
  })

  it('expose l’avancement de moisson en POURCENTAGE, et les durées telles quelles', () => {
    // ⚠ Stocké en fraction (0..1) : laissé tel quel, un balayage terminé s'afficherait « 1 % ».
    const [row] = summaryRows([stat({
      harvest: { lastMs: 12_000, cumulMs: 480_000, progress: 0.5, sweeps: 3 },
    })])
    expect(row).toMatchObject({
      harvestProgress: 50, harvestSweeps: 3, harvestLastMs: 12_000, harvestCumulMs: 480_000,
    })
  })

  it('⚠ laisse la moisson ABSENTE quand elle n’a jamais été mesurée', () => {
    // Un 0 se lirait « n'a rien collecté » là où l'on ne sait simplement rien.
    const [row] = summaryRows([stat()])
    expect(row.harvestProgress).toBeNull()
    expect(row.harvestCumulMs).toBeNull()
  })

  it('exécute une mesure DÉRIVÉE d’une colonne du rapport', () => {
    // Le moteur sait exécuter `{field, agg}` : c'est ce qui permet aux sources de veille de
    // ne plus déclarer une mesure par colonne.
    const rows = summaryRows([
      stat({ audit: audit(100, 80) }),
      stat({ siteId: 'b', domain: 'b.fr', audit: audit(300, 40) }),
    ])
    const res = aggregate(rows, {
      source: 'watch.summary',
      measures: [{ field: 'indexed', agg: 'sum' }, { field: 'pctStock', agg: 'max' }],
      dimensions: [], filters: [],
    }, watchSummarySource)
    expect(res.rows).toEqual([{ 'sum:indexed': 400, 'max:pctStock': 0 }])
    // ⚠ La colonne de résultat porte la clé de son libellé traduit, jamais l'identifiant brut.
    expect(res.columns.map((c) => c.columnKey)).toEqual([
      'bi.measure.watchIndexed', 'bi.dim.watchPctStock',
    ])
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

  it('expose le QUATRIÈME niveau de taxonomie', () => {
    // ⚠ Le suivi porte une taxonomie à quatre niveaux (Univers en racine) : s'arrêter à
    // trois faisait disparaître le dernier sans un mot.
    const [row] = catalogRows([product({ taxo: ['Univers', 'Filtration', 'Air', 'Cartouches'] })])
    expect(row).toMatchObject({
      famille: 'Univers', sousFamille: 'Filtration', groupe: 'Air', taxo4: 'Cartouches',
    })
  })

  it('rend les références d’origine en texte joint ET en nombre', () => {
    const [row] = catalogRows([product({ originRefs: ['754-04038', '954-04038'] })])
    expect(row.originRefs).toBe('754-04038 · 954-04038')
    expect(row.originRefsCount).toBe(2)
    expect(catalogRows([product()])[0].originRefs).toBeNull()
    // ⚠ Champ ABSENT = `null`, jamais 0 : la plupart des fiches n'en citent aucune, et un
    // zéro partout ferait annoncer « 100 % renseigné » à leur taux de remplissage.
    expect(catalogRows([product()])[0].originRefsCount).toBeNull()
    // Une liste VIDE, en revanche, est une information : zéro référence d'origine citée.
    expect(catalogRows([product({ originRefs: [] })])[0].originRefsCount).toBe(0)
  })

  it('rend les colonnes d’affichage du catalogue source', () => {
    const [row] = catalogRows([product({
      url: 'https://f1.fr/p/1', description: 'Filtre haute filtration',
      image: 'img/1.jpg', nameSource: 'FILTRE AIR', descriptionSource: 'brut',
    })])
    expect(row).toMatchObject({
      url: 'https://f1.fr/p/1', description: 'Filtre haute filtration',
      image: 'img/1.jpg', nameSource: 'FILTRE AIR', descriptionSource: 'brut',
    })
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

  it('rend les prix professionnels SANS les confondre avec le prix de vente', () => {
    // ⚠⚠ `netPrice` est un prix d'ACHAT : exposé sous son propre nom, jamais fondu dans
    // `price`, sans quoi l'écart annoncé serait de 150 % pour deux grandeurs différentes.
    const [row] = listingRows([listing({ netPrice: 6.54, advisedPrice: 24.9, currency: 'EUR' })])
    expect(row).toMatchObject({ price: 19.9, netPrice: 6.54, advisedPrice: 24.9, currency: 'EUR' })
  })

  it('⚠ laisse le régime de TVA et l’enrichissement INCONNUS quand rien ne les déclare', () => {
    // « Non déclaré » n'est pas « faux » : les confondre ferait passer pour HT tous les prix
    // dont on ignore le régime, et pour « jamais ouverte » toute fiche d'avant le drapeau.
    const [row] = listingRows([listing()])
    expect(row.taxIncluded).toBeNull()
    expect(row.enriched).toBeNull()
    expect(listingRows([listing({ taxIncluded: true, enriched: false })])[0]).toMatchObject({
      taxIncluded: true, enriched: false,
    })
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
  // casserait toutes les tuiles déjà posées, sans un mot à l'écran. On en AJOUTE, on n'en
  // retire ni n'en renomme jamais — d'où le `toContain` champ par champ pour les anciens.
  it('conserve les identifiants de dimension historiques', () => {
    const ids = (s: typeof watchSummarySource) => s.dimensions.map((d) => d.id)
    for (const id of ['domain', 'medGapPct', 'pctPrice']) {
      expect(ids(watchSummarySource)).toContain(id)
    }
    for (const id of ['famille', 'sousFamille', 'groupe', 'name', 'ref', 'ref2', 'ean',
      'price', 'hasPrice', 'hasRef']) {
      expect(ids(watchCatalogSource)).toContain(id)
    }
    for (const id of ['name', 'ref', 'ean', 'price', 'listPrice', 'discountPct',
      'availability', 'seller', 'hasPrice', 'hasRef']) {
      expect(ids(watchSiteSource)).toContain(id)
    }
  })

  it('⚠ garde en TÊTE le repli du constructeur : première dimension, première mesure', () => {
    // `AddTileMenu` et `newTile` se replient sur l'indice 0 quand un identifiant a disparu.
    for (const s of [watchSummarySource, watchCatalogSource, watchSiteSource]) {
      expect(s.measures[0].id).toBe('count')
      expect(s.measures[0].derivedFrom).toBeUndefined()
    }
    expect(watchSummarySource.dimensions[0].id).toBe('domain')
    expect(watchCatalogSource.dimensions[0].id).toBe('famille')
    expect(watchSiteSource.dimensions[0].id).toBe('name')
  })

  it('expose TOUTE dimension numérique comme mesure, et toute colonne texte en décomptes', () => {
    // Le reproche de recette : « il manque beaucoup de mesures ». Chaque colonne réelle doit
    // être agrégeable de toutes les façons que son type autorise.
    for (const s of [watchSummarySource, watchCatalogSource, watchSiteSource]) {
      for (const d of s.dimensions) {
        const derived = s.measures.filter((m) => m.derivedFrom?.field === d.id)
        const aggs = derived.map((m) => m.derivedFrom?.agg)
        expect(aggs).toContain('count')
        expect(aggs).toContain('countDistinct')
        expect(aggs).toContain('filledPct')
        if (d.kind === 'number') {
          expect(aggs).toContain('avg')
          expect(aggs).toContain('median')
          expect(aggs).toContain('min')
          expect(aggs).toContain('max')
        } else {
          expect(aggs).not.toContain('sum')
        }
      }
    }
  })

  it('nomme chaque mesure dérivée par sa colonne, via le CATALOGUE i18n', () => {
    // ⚠ Ces colonnes ne viennent pas d'un fichier utilisateur : leur nom est traduit
    // (`columnKey`), jamais lu dans la donnée (`label`). Sans lui, le volet Champs
    // afficherait cent trente fois « Somme », « Moyenne », « Médiane ».
    for (const s of [watchSummarySource, watchCatalogSource, watchSiteSource]) {
      for (const m of s.measures.filter((x) => x.derivedFrom)) {
        expect(m.columnKey).toBeTruthy()
        expect(m.label).toBeUndefined()
      }
    }
  })

  it('⚠⚠ marque médiane et pourcentage NON agrégeables', () => {
    // Sans ce drapeau, une tuile totaliserait vingt-quatre écarts médians et afficherait
    // « −312 % ». C'est `AggregateResult.aggregable` qui l'en empêche, et il vient d'ici.
    const declared = watchSummarySource.measures.filter((m) => !m.derivedFrom)
    expect(declared.filter((m) => !m.aggregable).map((m) => m.id))
      .toEqual(['watch.medGap', 'watch.pctPrice'])
    expect(watchCatalogSource.measures.find((m) => m.id === 'watch.medianPrice')?.aggregable).toBe(false)
  })

  it('⚠⚠ n’offre AUCUNE somme sur une colonne de pourcentage', () => {
    // L'invariant du projet : l'écart médian d'un concurrent ne doit jamais pouvoir être
    // sommé. Il ne suffit pas de le marquer non agrégeable — encore faut-il que la
    // dérivation ne propose pas « Somme · Écart médian ».
    // L'écart médian et la remise SONT des colonnes de pourcentage : la règle porte.
    expect(watchSummarySource.dimensions.find((d) => d.id === 'medGapPct')?.format).toBe('pct')
    expect(watchSiteSource.dimensions.find((d) => d.id === 'discountPct')?.format).toBe('pct')
    for (const s of [watchSummarySource, watchCatalogSource, watchSiteSource]) {
      const pctFields = s.dimensions.filter((d) => d.format === 'pct').map((d) => d.id)
      for (const field of pctFields) {
        const on = s.measures.filter((m) => m.derivedFrom?.field === field)
        expect(on.map((m) => m.derivedFrom?.agg)).not.toContain('sum')
        // Et ce qui reste (moyenne, médiane, extrema) ne se recompose pas entre groupes.
        for (const m of on.filter((x) => x.derivedFrom?.agg !== 'count'
          && x.derivedFrom?.agg !== 'countDistinct')) {
          expect(m.aggregable).toBe(false)
        }
      }
    }
  })

  it('tourne en mémoire (moteur client) tant que le lot 3 n’est pas là', () => {
    expect(watchSummarySource.engine).toBe('client')
    expect(watchCatalogSource.engine).toBe('client')
    expect(watchSiteSource.engine).toBe('client')
  })
})
