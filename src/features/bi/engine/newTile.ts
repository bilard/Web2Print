// Fabrique d'une tuile par défaut. PUR — et son résultat DOIT passer `parseDashboard` :
// une tuile invalide serait écartée à la lecture, donc invisible sans un mot.
import { getSource } from '../registry/sources'
import type { SourceId, Tile, TileKind, TilePlacement } from '../types'

/** Taille de départ par type, en cellules de la grille (12 colonnes). */
const SIZES: Record<TileKind, { w: number; h: number }> = {
  kpi: { w: 3, h: 3 },
  bar: { w: 6, h: 6 }, line: { w: 6, h: 6 }, area: { w: 6, h: 6 },
  pie: { w: 4, h: 6 }, doughnut: { w: 4, h: 6 },
  table: { w: 6, h: 7 }, pivot: { w: 8, h: 7 },
}

export function newTile(kind: TileKind, source: SourceId, measureId: string, dimensionId?: string): Tile {
  const s = getSource(source)
  const measure = s.measures.find((m) => m.id === measureId) ?? s.measures[0]
  // ⚠ Une tuile KPI montre UNE valeur : lui donner une dimension produirait plusieurs
  // lignes dont une seule serait affichée — un chiffre faux, sans avertissement.
  const dimensions = kind === 'kpi' || !dimensionId ? [] : [{ id: dimensionId }]
  return {
    id: `t_${Date.now().toString(36)}_${Math.round(performance.now())}`,
    kind,
    title: '',
    query: { source, measures: [{ id: measure.id }], dimensions, filters: [] },
  }
}

/** Pose la tuile sous tout ce qui existe : recouvrir une tuile en place serait un vol. */
export function placeTile(layout: TilePlacement[], tileId: string, kind: TileKind): TilePlacement[] {
  const bottom = layout.reduce((y, l) => Math.max(y, l.y + l.h), 0)
  const { w, h } = SIZES[kind]
  return [...layout, { tileId, x: 0, y: bottom, w, h }]
}
