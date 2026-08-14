// Modèle « Complétude PIM » — ce qui est renseigné, et où ça manque. PUR : des données.
//
// ⚠⚠ Il ne référence QUE la taxonomie (`taxo.1`…`taxo.4`) et les trois mesures de base
// (`count`, `pim.completeness`, `pim.filled`). C'est l'INTERSECTION des deux visages de la
// source PIM : `effectivePimSource` bascule sur les colonnes de la feuille ACTIVE dès qu'une
// base est ouverte dans le module Données, et cette bascule fait perdre les dimensions de date
// (`_createdAt`, `_updatedAt`) ainsi que la mesure d'ancienneté. Un modèle qui s'appuierait
// dessus s'afficherait en erreur chez tout utilisateur ayant une feuille ouverte — c'est-à-dire
// le cas normal.
//
// ⚠⚠ Pas de « complétude par marque » : AUCUNE source ne déclare de dimension « marque ». La
// marque est une COLONNE, dont la clé varie d'un catalogue à l'autre ; la citer en dur poserait
// une tuile en erreur partout ailleurs. Elle se pose en deux gestes depuis le constructeur, et
// une dimension déclarée reste à arbitrer avec le contrat.
//
// ⚠ `pim.completeness` est un POURCENTAGE : non agrégeable. Aucune tuile ne la totalise.
import type { DashboardTemplate, TemplateTile } from './types'

const src = 'pim.products' as const

/** Barres d'une mesure le long d'un niveau de taxonomie. */
function bar(
  id: string, titleKey: TemplateTile['titleKey'], measure: string, dim: string,
  dir: 'asc' | 'desc', limit?: number,
): TemplateTile {
  return {
    id, kind: 'bar', titleKey,
    query: {
      source: src, measures: [{ id: measure }], dimensions: [{ id: dim }], filters: [],
      sort: [{ by: measure, dir }], ...(limit ? { limit } : {}),
    },
  }
}

const tiles: TemplateTile[] = [
  {
    id: 'pc_completeness', kind: 'kpi', titleKey: 'bi.tpl.pim.completeness',
    query: { source: src, measures: [{ id: 'pim.completeness' }], dimensions: [], filters: [] },
  },
  {
    id: 'pc_count', kind: 'kpi', titleKey: 'bi.tpl.pim.products',
    query: { source: src, measures: [{ id: 'count' }], dimensions: [], filters: [] },
  },
  {
    id: 'pc_filled', kind: 'kpi', titleKey: 'bi.tpl.pim.filled',
    query: { source: src, measures: [{ id: 'pim.filled' }], dimensions: [], filters: [] },
  },
  bar('pc_by_universe', 'bi.tpl.pim.byUniverse', 'pim.completeness', 'taxo.1', 'desc'),
  bar('pc_volume_universe', 'bi.tpl.pim.volumeByUniverse', 'count', 'taxo.1', 'desc'),
  // ⚠ Tri ASCENDANT et coupe à 15 : ce sont les familles les moins complètes qu'on cherche,
  // pas les mieux tenues. Sans le tri, la coupe prendrait quinze familles au hasard.
  bar('pc_weak_families', 'bi.tpl.pim.weakFamilies', 'pim.completeness', 'taxo.2', 'asc', 15),
  {
    id: 'pc_table', kind: 'table', titleKey: 'bi.tpl.pim.tableFamily',
    query: {
      source: src, measures: [{ id: 'count' }, { id: 'pim.filled' }, { id: 'pim.completeness' }],
      dimensions: [{ id: 'taxo.2' }], filters: [], sort: [{ by: 'count', dir: 'desc' }],
    },
  },
  {
    // Croisement univers × famille. ⚠ `count` est agrégeable : les totaux sont ici légitimes,
    // et c'est la seule tuile du lot qui les affiche.
    id: 'pc_pivot', kind: 'pivot', titleKey: 'bi.tpl.pim.pivot',
    query: {
      source: src, measures: [{ id: 'count' }],
      dimensions: [{ id: 'taxo.1' }, { id: 'taxo.2' }], filters: [],
    },
    options: { pivotColumn: 'taxo.2', showTotals: true },
  },
]

export const pimCompletenessTemplate: DashboardTemplate = {
  key: 'pimCompleteness',
  nameKey: 'bi.tpl.pim.name',
  descKey: 'bi.tpl.pim.desc',
  sources: [src],
  filters: [],
  pages: [{
    nameKey: 'bi.tpl.pim.page',
    tiles,
    layout: [
      { tileId: 'pc_completeness', x: 0, y: 0, w: 4, h: 3 },
      { tileId: 'pc_count', x: 4, y: 0, w: 4, h: 3 },
      { tileId: 'pc_filled', x: 8, y: 0, w: 4, h: 3 },
      { tileId: 'pc_by_universe', x: 0, y: 3, w: 6, h: 6 },
      { tileId: 'pc_volume_universe', x: 6, y: 3, w: 6, h: 6 },
      { tileId: 'pc_weak_families', x: 0, y: 9, w: 6, h: 6 },
      { tileId: 'pc_table', x: 6, y: 9, w: 6, h: 6 },
      { tileId: 'pc_pivot', x: 0, y: 15, w: 12, h: 8 },
    ],
  }],
}
