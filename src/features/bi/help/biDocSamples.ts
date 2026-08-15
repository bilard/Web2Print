// Les jeux d'exemple de la documentation du module BI. PURS : aucune donnée réelle, aucune
// requête — de quoi montrer ce que chaque visuel sait faire, et rien d'autre.
//
// ⚠⚠ SOURCE UNIQUE : l'aide intégrée à l'application et le PDF (`npm run doc:bi`) montent
// ces mêmes jeux. Deux séries d'exemples finiraient par diverger, et la documentation
// imprimée cesserait de décrire l'écran qu'on a sous les yeux.
import type { AggregateResult } from '../engine/aggregate'
import type { Tile, TileKind } from '../types'

const SITES = ['webmotoculture', 'matijardin', 'jardimax', 'emc-motoculture',
  '190cc', 'progarden', 'sos-accessoire', 'dppmsas']

const columns = (list: [string, string, string, string?][]): AggregateResult['columns'] =>
  list.map(([key, label, role, format]) => ({
    key, label, labelKey: 'bi.dim.column', role, format,
  })) as AggregateResult['columns']

/** Un concurrent par ligne : volume apparié, écart médian, complétude. */
const byCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['paired', 'Produits appariés', 'measure', 'int'],
    ['gap', 'Écart médian', 'measure', 'pct'],
    ['filled', 'Complétude', 'measure', 'pct'],
  ]),
  rows: SITES.map((site, i) => ({
    site,
    paired: Math.round(20529 / (i * 0.6 + 1)),
    gap: Math.round((i - 3.2) * 7.4 * 10) / 10,
    filled: 40 + ((i * 11) % 55),
  })),
}

/**
 * Une mesure, une dimension : la forme que la plupart des visuels attendent.
 *
 * ⚠⚠ Volontairement SÉPARÉ de `byCompetitor` : illustrer les barres avec ses trois mesures
 * (un volume, un pourcentage d'écart, un pourcentage de complétude) écraserait les deux
 * dernières sous la première — la documentation montrerait exactement le défaut qu'elle
 * apprend à éviter.
 */
const volumeByCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['paired', 'Produits appariés', 'measure', 'int'],
  ]),
  rows: byCompetitor.rows.map((r) => ({ site: r.site, paired: r.paired })),
}

/** Une mesure SIGNÉE : sans valeurs négatives, la coloration par signe n'a rien à montrer. */
const gapByCompetitor: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['gap', 'Écart médian', 'measure', 'pct'],
  ]),
  rows: byCompetitor.rows.map((r) => ({ site: r.site, gap: r.gap })),
}

/** Une seule valeur : ce que montre un indicateur sans axe. */
const total: AggregateResult = {
  columns: columns([['paired', 'Fiches indexées', 'measure', 'int']]),
  rows: [{ paired: 534735 }],
}

/** Une valeur par mois : ce qui donne sa tendance à l'indicateur, et sa courbe à la ligne. */
const byMonth: AggregateResult = {
  columns: columns([
    ['month', 'Mois', 'dimension'],
    ['paired', 'Fiches indexées', 'measure', 'int'],
  ]),
  rows: ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
    .map((month, i) => ({ month, paired: 380000 + i * 31000 + (i % 2) * 9000 })),
}

/** Deux dimensions croisées : ce qu'exigent le croisé, la carte de chaleur et l'empilement. */
const crossed: AggregateResult = {
  columns: columns([
    ['site', 'Concurrent', 'dimension'],
    ['position', 'Position', 'dimension'],
    ['n', 'Produits', 'measure', 'int'],
  ]),
  rows: SITES.slice(0, 5).flatMap((site, i) => [
    { site, position: 'Moins cher', n: 30 + i * 12 },
    { site, position: 'Aligné', n: 20 + (i % 3) * 6 },
    { site, position: 'Plus cher', n: 60 - i * 8 },
  ]),
}

/**
 * Deux dimensions ET deux mesures : la seule forme qu'un nuage COLORÉ par catégorie peut
 * prendre — il lui faut ses deux axes en plus de sa légende.
 */
const pricePosition: AggregateResult = {
  columns: columns([
    ['ref', 'Référence', 'dimension'],
    ['position', 'Position', 'dimension'],
    ['price', 'Mon prix HT', 'measure', 'eur'],
    ['gap', 'Écart concurrent', 'measure', 'pct'],
  ]),
  rows: Array.from({ length: 60 }, (_, i) => {
    const gap = Math.round((Math.sin(i * 1.7) * 34 - 6) * 10) / 10
    return {
      ref: `REF-${100 + i}`,
      position: gap < -4 ? 'Concurrent moins cher' : gap > 4 ? 'Je suis moins cher' : 'Aligné',
      price: Math.round(12 + Math.abs(Math.sin(i * 0.9)) * 320),
      gap,
    }
  }),
}

/** Étapes décroissantes : la forme qu'un entonnoir attend. */
const funnel: AggregateResult = {
  columns: columns([
    ['step', 'Étape', 'dimension'],
    ['n', 'Produits', 'measure', 'int'],
  ]),
  rows: [
    { step: 'Catalogue', n: 11581 }, { step: 'Indexés', n: 8420 },
    { step: 'Appariés', n: 4210 }, { step: 'Avec prix', n: 3180 },
  ],
}

/**
 * Les visuels de la documentation, dans l'ordre où on les découvre : d'abord le chiffre
 * seul, puis la comparaison, puis le croisement, puis l'exploration.
 *
 * ⚠ Chaque entrée choisit SON jeu. Illustrer les barres avec les trois mesures de
 * `byCompetitor` (un volume, deux pourcentages) écraserait les deux dernières sous la
 * première : la documentation montrerait exactement le défaut qu'elle apprend à éviter.
 */
const RAW = [
  { id: 'kpi', kind: 'kpi', name: 'Indicateur', result: total, height: 150 },
  { id: 'kpi-trend', kind: 'kpi', name: 'Indicateur à tendance', result: byMonth, height: 180 },
  { id: 'gauge', kind: 'gauge', name: 'Jauge', result: total, height: 190 },
  { id: 'bar', kind: 'bar', name: 'Barres', result: volumeByCompetitor },
  { id: 'bar-horizontal', kind: 'bar', name: 'Barres couchées', result: volumeByCompetitor,
    options: { horizontal: true } },
  { id: 'bar-diverging', kind: 'bar', name: 'Couleur par signe', result: gapByCompetitor,
    options: { horizontal: true, diverging: true, referenceLine: 0 } },
  { id: 'bar-stacked', kind: 'bar', name: 'Barres empilées', result: crossed,
    options: { stacked: true } },
  { id: 'bar-percent', kind: 'bar', name: 'Empilement à 100 %', result: crossed,
    options: { stackPercent: true } },
  { id: 'line', kind: 'line', name: 'Courbe', result: byMonth,
    options: { referenceLine: 450000 } },
  { id: 'area', kind: 'area', name: 'Aires', result: byMonth },
  { id: 'pie', kind: 'pie', name: 'Camembert', result: volumeByCompetitor },
  { id: 'doughnut', kind: 'doughnut', name: 'Anneau', result: volumeByCompetitor },
  { id: 'table', kind: 'table', name: 'Tableau', result: byCompetitor },
  { id: 'pivot', kind: 'pivot', name: 'Tableau croisé', result: crossed,
    options: { pivotColumn: 'position', showTotals: true } },
  { id: 'heatmap', kind: 'heatmap', name: 'Carte de chaleur', result: crossed,
    options: { pivotColumn: 'position' } },
  { id: 'scatter', kind: 'scatter', name: 'Nuage de points', result: byCompetitor },
  { id: 'scatter-legend', kind: 'scatter', name: 'Nuage coloré par catégorie',
    result: pricePosition },
  { id: 'scatter3d', kind: 'scatter3d', name: 'Nuage 3D', result: byCompetitor, height: 340 },
  { id: 'funnel', kind: 'funnel', name: 'Entonnoir', result: funnel },
] as const

export type SampleId = (typeof RAW)[number]['id']

export interface Sample {
  id: SampleId
  kind: TileKind
  name: string
  result: AggregateResult
  options?: Tile['options']
  height?: number
}

/** ⚠ Le tableau littéral (`RAW`) sert à DÉRIVER les identifiants, la vue typée à les LIRE :
 *  sur le littéral, une propriété optionnelle absente d'une entrée n'existe pas du tout. */
export const SAMPLES: readonly Sample[] = RAW

