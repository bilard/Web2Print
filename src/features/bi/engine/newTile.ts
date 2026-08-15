// Fabrique d'une tuile par défaut. PUR — et son résultat DOIT passer `parseDashboard` :
// une tuile invalide serait écartée à la lecture, donc invisible sans un mot.
import type { MeasureRef, SourceId, Tile, TileKind, TilePlacement } from '../types'

/** Taille de départ par type, en cellules de la grille (12 colonnes).
 *  ⚠ Exporté pour la mise en page d'un tableau créé par prompt : deux barèmes de tailles
 *  feraient des tuiles d'un tableau généré plus petites que les mêmes posées à la main. */
export const SIZES: Record<TileKind, { w: number; h: number }> = {
  kpi: { w: 3, h: 3 },
  bar: { w: 6, h: 6 }, line: { w: 6, h: 6 }, area: { w: 6, h: 6 },
  pie: { w: 4, h: 6 }, doughnut: { w: 4, h: 6 },
  table: { w: 6, h: 7 }, pivot: { w: 8, h: 7 },
  // La jauge tient dans un carré ; l'entonnoir a besoin de hauteur pour ses étapes ; le
  // nuage et la carte de chaleur, de largeur pour que leurs axes restent lisibles.
  gauge: { w: 3, h: 4 }, funnel: { w: 5, h: 6 },
  scatter: { w: 6, h: 6 }, heatmap: { w: 8, h: 7 },
  // Le nuage 3D se tourne : sous cette taille, la boîte et ses étiquettes d'axes se
  // chevauchent au premier quart de tour.
  scatter3d: { w: 6, h: 8 },
}

/**
 * ⚠⚠ La mesure arrive TELLE QUELLE, jamais re-résolue contre le registre : celui-ci est
 * STATIQUE et ne connaît pas les colonnes de la feuille active. Il la cherchait auparavant
 * par identifiant et se repliait sur `measures[0]` — toute mesure dérivée d'une colonne
 * serait redevenue « Nombre de produits », sans un mot. La validation, elle, appartient à
 * `parseDashboard` (forme) et au moteur (existence de la colonne).
 */
export function newTile(
  kind: TileKind, source: SourceId, measure: MeasureRef,
  dimensionId?: string, columnDimensionId?: string,
): Tile {
  // ⚠ Une tuile KPI montre UNE valeur : lui donner une dimension produirait plusieurs
  // lignes dont une seule serait affichée — un chiffre faux, sans avertissement.
  const dimensions = kind === 'kpi' || !dimensionId ? [] : [{ id: dimensionId }]
  // ⚠⚠ Le tableau croisé croise DEUX axes : posé avec une seule dimension, il n'affichait
  // que « un tableau croisé demande deux dimensions » — livré mais inatteignable.
  // ⚠ Même dimension des deux côtés = pas de croisement : on l'ignore plutôt que de poser
  // une spec dont le composant ne saurait tirer une ligne.
  const crossed = kind === 'pivot' && columnDimensionId && columnDimensionId !== dimensionId
  if (crossed) dimensions.push({ id: columnDimensionId })
  return {
    id: `t_${Date.now().toString(36)}_${Math.round(performance.now())}`,
    kind,
    title: '',
    query: { source, measures: [measure], dimensions, filters: [] },
    // La colonne est DÉSIGNÉE, jamais devinée : sans elle, `PivotTile` se rabat sur la
    // seconde dimension — juste par hasard, faux dès qu'un troisième axe s'ajoute.
    ...(crossed ? { options: { pivotColumn: columnDimensionId } } : {}),
  }
}

/** Pose la tuile sous tout ce qui existe : recouvrir une tuile en place serait un vol. */
export function placeTile(layout: TilePlacement[], tileId: string, kind: TileKind): TilePlacement[] {
  const bottom = layout.reduce((y, l) => Math.max(y, l.y + l.h), 0)
  const { w, h } = SIZES[kind]
  return [...layout, { tileId, x: 0, y: bottom, w, h }]
}
