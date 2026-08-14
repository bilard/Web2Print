// Source et tuile de RÉFÉRENCE pour les tests du constructeur.
//
// ⚠ Deux colonnes seulement, mais une de chaque nature : une numérique (qui autorise somme,
// moyenne, médiane) et une textuelle (qui ne les autorise pas). C'est cette différence qui
// fait tout le sel des règles — un jeu mono-type les laisserait toutes passer.
import { deriveMeasures } from '../registry/deriveMeasures'
import type { DataSource, Row } from '../registry/types'
import type { Tile, TileKind } from '../types'

export const testSource: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [
    { id: 'brand', labelKey: 'bi.dim.column', label: 'Marque', kind: 'text', get: (r: Row) => r.brand },
    { id: 'price', labelKey: 'bi.dim.column', label: 'Prix', kind: 'number', get: (r: Row) => r.price },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
      compute: (rows: Row[]) => rows.length },
    // ⚠ Une mesure DÉCLARÉE non agrégeable : c'est elle que les zones qui totalisent refusent.
    { id: 'pim.completeness', labelKey: 'bi.measure.completeness', format: 'pct', aggregable: false,
      compute: () => 0 },
    ...deriveMeasures([
      { key: 'price', label: 'Prix', kind: 'number' },
      { key: 'brand', label: 'Marque', kind: 'text' },
    ]),
  ],
}

/** Les huit types du contrat. ⚠ Écrits ici plutôt qu'importés : `TILE_KINDS` n'est pas
 *  exporté par `types.ts`, et un test qui n'en couvrirait que la moitié laisserait passer
 *  exactement le genre de défaut qu'il existe pour attraper. */
export const TILE_KINDS_FOR_TEST: TileKind[] = [
  'kpi', 'bar', 'line', 'area', 'pie', 'doughnut', 'table', 'pivot',
]

/** Une tuile minimale et VALIDE : une mesure, la dimension demandée. */
export function testTile(kind: TileKind, dimensionIds: string[] = []): Tile {
  return {
    id: 't1', kind, title: 'Test',
    query: {
      source: 'pim.products',
      measures: [{ id: 'count' }],
      dimensions: dimensionIds.map((id) => ({ id })),
      filters: [],
    },
  }
}
