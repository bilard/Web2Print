// Modèle « Écarts concurrents » — la question que l'utilisateur pose en premier : où nos prix
// se situent, concurrent par concurrent. PUR : des données, aucune dépendance.
//
// ⚠⚠ Bâti sur `watch.summary` SEULE : une ligne par concurrent, tirée du document
// `reports/latest`. C'est la source instantanée — le tableau s'ouvre sans relire 115 814
// produits, et il coule en direct (`onSnapshot`).
//
// ⚠⚠ « Moins cher / aligné / plus cher » n'est PAS représentable aujourd'hui : le rapport ne
// porte que `cheaper` (fiches où le concurrent est moins cher que nous) et `matched`. Poser
// « aligné » = `matched − cheaper` fondrait « aligné » et « plus cher » dans un seul seau
// INVENTÉ. On montre donc les deux chiffres réels côte à côte, et la ventilation attendra le
// moteur serveur (lot 3), qui seul peut croiser tous les concurrents à la maille fiche.
//
// ⚠⚠ `watch.medGap` est une MÉDIANE : non agrégeable. Elle n'apparaît qu'en tuiles groupées
// PAR CONCURRENT — un groupe y vaut exactement une ligne, la médiane est donc la valeur
// elle-même. Aucun indicateur global ne la totalise : une médiane de médianes sur vingt-quatre
// concurrents ne veut rien dire.
import type { DashboardTemplate, TemplateTile } from './types'

const src = 'watch.summary' as const

/** Indicateur : une mesure DÉCLARÉE, sans dimension — une seule valeur, jamais un total faux. */
function kpi(id: string, titleKey: TemplateTile['titleKey'], measure: string): TemplateTile {
  return {
    id, kind: 'kpi', titleKey,
    query: { source: src, measures: [{ id: measure }], dimensions: [], filters: [] },
  }
}

/** Barres par concurrent, du plus fort au plus faible : c'est l'ordre de lecture attendu. */
function barByCompetitor(id: string, titleKey: TemplateTile['titleKey'], measure: string): TemplateTile {
  return {
    id, kind: 'bar', titleKey,
    query: {
      source: src, measures: [{ id: measure }], dimensions: [{ id: 'domain' }], filters: [],
      sort: [{ by: measure, dir: 'desc' }],
    },
  }
}

const tiles: TemplateTile[] = [
  kpi('wg_matched', 'bi.tpl.gaps.matched', 'watch.matched'),
  kpi('wg_cheaper', 'bi.tpl.gaps.cheaper', 'watch.cheaper'),
  kpi('wg_ruptures', 'bi.tpl.gaps.ruptures', 'watch.ruptures'),
  kpi('wg_indexed', 'bi.tpl.gaps.indexed', 'watch.indexed'),
  barByCompetitor('wg_medgap', 'bi.tpl.gaps.medGapBySite', 'watch.medGap'),
  barByCompetitor('wg_cheaper_bar', 'bi.tpl.gaps.cheaperBySite', 'watch.cheaper'),
  barByCompetitor('wg_matched_bar', 'bi.tpl.gaps.matchedBySite', 'watch.matched'),
  barByCompetitor('wg_ruptures_bar', 'bi.tpl.gaps.rupturesBySite', 'watch.ruptures'),
  {
    // Le détail chiffré, concurrent par concurrent : c'est la tuile qu'on lit pour agir.
    // ⚠ Pas de `showTotals` : deux de ses mesures (écart médian, part avec prix) ne se
    // totalisent pas.
    id: 'wg_table', kind: 'table', titleKey: 'bi.tpl.gaps.table',
    query: {
      source: src,
      measures: [
        { id: 'watch.matched' }, { id: 'watch.cheaper' }, { id: 'watch.ruptures' },
        { id: 'watch.medGap' }, { id: 'watch.indexed' }, { id: 'watch.pctPrice' },
      ],
      dimensions: [{ id: 'domain' }], filters: [],
      sort: [{ by: 'watch.matched', dir: 'desc' }],
    },
  },
]

export const watchGapsTemplate: DashboardTemplate = {
  key: 'watchGaps',
  nameKey: 'bi.tpl.gaps.name',
  descKey: 'bi.tpl.gaps.desc',
  sources: [src],
  filters: [],
  pages: [{
    nameKey: 'bi.tpl.gaps.page',
    tiles,
    layout: [
      { tileId: 'wg_matched', x: 0, y: 0, w: 3, h: 3 },
      { tileId: 'wg_cheaper', x: 3, y: 0, w: 3, h: 3 },
      { tileId: 'wg_ruptures', x: 6, y: 0, w: 3, h: 3 },
      { tileId: 'wg_indexed', x: 9, y: 0, w: 3, h: 3 },
      { tileId: 'wg_medgap', x: 0, y: 3, w: 6, h: 6 },
      { tileId: 'wg_cheaper_bar', x: 6, y: 3, w: 6, h: 6 },
      { tileId: 'wg_matched_bar', x: 0, y: 9, w: 6, h: 6 },
      { tileId: 'wg_ruptures_bar', x: 6, y: 9, w: 6, h: 6 },
      { tileId: 'wg_table', x: 0, y: 15, w: 12, h: 8 },
    ],
  }],
}
