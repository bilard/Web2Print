// Modèle « Couverture catalogue » — ce que chaque concurrent couvre de notre catalogue, et ce
// que notre catalogue contient. PUR : des données, aucune dépendance.
//
// ⚠⚠ DEUX sources sur la même page, à dessein : la synthèse par concurrent (instantanée) et le
// catalogue source (115 814 produits chez F1, relu par tranches). Le chargement lourd part donc
// à l'ouverture du tableau — c'est assumé : ce sont les tuiles de volumétrie qui le réclament,
// et `useWatchLoader` en publie l'avancement. Aucune tuile ne le demanderait « au cas où ».
//
// ⚠ La part de fiches avec prix (`watch.pctPrice`) est PONDÉRÉE par les fiches indexées et
// n'est pas agrégeable : elle ne figure qu'au tableau, sans total.
import type { DashboardTemplate, TemplateTile } from './types'

const tiles: TemplateTile[] = [
  {
    id: 'cc_indexed', kind: 'kpi', titleKey: 'bi.tpl.coverage.indexed',
    query: { source: 'watch.summary', measures: [{ id: 'watch.indexed' }], dimensions: [], filters: [] },
  },
  {
    id: 'cc_products', kind: 'kpi', titleKey: 'bi.tpl.coverage.products',
    query: { source: 'watch.catalog', measures: [{ id: 'count' }], dimensions: [], filters: [] },
  },
  {
    // Part de produits du catalogue portant un prix. ⚠ `filledPct` est un TAUX : jamais totalisé.
    id: 'cc_withprice', kind: 'kpi', titleKey: 'bi.tpl.coverage.withPrice',
    query: {
      source: 'watch.catalog', measures: [{ field: 'price', agg: 'filledPct' }],
      dimensions: [], filters: [],
    },
  },
  {
    // Ce que chaque concurrent APPARIE de notre catalogue : la couverture, au sens strict.
    id: 'cc_matched_bar', kind: 'bar', titleKey: 'bi.tpl.coverage.matchedBySite',
    query: {
      source: 'watch.summary', measures: [{ id: 'watch.matched' }], dimensions: [{ id: 'domain' }],
      filters: [], sort: [{ by: 'watch.matched', dir: 'desc' }],
    },
  },
  {
    // Ce que chaque concurrent a INDEXÉ chez lui : la taille de sa vitrine, pas sa couverture.
    id: 'cc_indexed_bar', kind: 'bar', titleKey: 'bi.tpl.coverage.indexedBySite',
    query: {
      source: 'watch.summary', measures: [{ id: 'watch.indexed' }], dimensions: [{ id: 'domain' }],
      filters: [], sort: [{ by: 'watch.indexed', dir: 'desc' }],
    },
  },
  {
    // ⚠ Limité aux 15 premières familles : au-delà, les barres deviennent illisibles. Le tri
    // rend ce « top 15 » exact — sans lui, la coupe prendrait quinze familles au hasard.
    id: 'cc_family_bar', kind: 'bar', titleKey: 'bi.tpl.coverage.byFamily',
    query: {
      source: 'watch.catalog', measures: [{ id: 'count' }], dimensions: [{ id: 'famille' }],
      filters: [], sort: [{ by: 'count', dir: 'desc' }], limit: 15,
    },
  },
  {
    // ⚠ Prix MÉDIAN et non moyen : un catalogue mêle des articles à 2 € et des machines
    // à 8 000 €. Groupé par famille, donc jamais recomposé entre groupes.
    id: 'cc_family_price', kind: 'bar', titleKey: 'bi.tpl.coverage.medianByFamily',
    query: {
      source: 'watch.catalog', measures: [{ id: 'watch.medianPrice' }],
      dimensions: [{ id: 'famille' }], filters: [],
      sort: [{ by: 'watch.medianPrice', dir: 'desc' }], limit: 15,
    },
  },
  {
    id: 'cc_table', kind: 'table', titleKey: 'bi.tpl.coverage.table',
    query: {
      source: 'watch.summary',
      measures: [{ id: 'watch.indexed' }, { id: 'watch.matched' }, { id: 'watch.pctPrice' }],
      dimensions: [{ id: 'domain' }], filters: [],
      sort: [{ by: 'watch.indexed', dir: 'desc' }],
    },
  },
]

export const catalogCoverageTemplate: DashboardTemplate = {
  key: 'catalogCoverage',
  nameKey: 'bi.tpl.coverage.name',
  descKey: 'bi.tpl.coverage.desc',
  sources: ['watch.summary', 'watch.catalog'],
  filters: [],
  pages: [{
    nameKey: 'bi.tpl.coverage.page',
    tiles,
    layout: [
      { tileId: 'cc_indexed', x: 0, y: 0, w: 4, h: 3 },
      { tileId: 'cc_products', x: 4, y: 0, w: 4, h: 3 },
      { tileId: 'cc_withprice', x: 8, y: 0, w: 4, h: 3 },
      { tileId: 'cc_matched_bar', x: 0, y: 3, w: 6, h: 6 },
      { tileId: 'cc_indexed_bar', x: 6, y: 3, w: 6, h: 6 },
      { tileId: 'cc_family_bar', x: 0, y: 9, w: 6, h: 6 },
      { tileId: 'cc_family_price', x: 6, y: 9, w: 6, h: 6 },
      { tileId: 'cc_table', x: 0, y: 15, w: 12, h: 8 },
    ],
  }],
}
