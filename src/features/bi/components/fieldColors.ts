// La couleur des champs et des zones du constructeur. PUR.
//
// ⚠⚠ La couleur porte une INFORMATION, jamais une décoration : la teinte dit le TYPE d'un
// champ (texte, nombre, date, oui/non) et le RÔLE d'une zone (axe, valeurs, légende…). Sur
// un volet de cent mesures toutes précédées du même sigma gris, l'œil ne s'accroche à rien ;
// avec une teinte par famille, on retrouve « les sommes » sans lire.
//
// ⚠ Ces teintes tiennent sur les deux thèmes : elles sont posées en couleur pleine sur du
// texte et en fond très dilué (`1a` = 10 %) sur les pastilles.
import type { FieldKind, MeasureFormat } from '../registry/types'
import type { WellId } from '../builder/wells'

/** Teinte par type de champ. Reprend le code des tableurs : texte froid, nombre indigo. */
export const KIND_COLOR: Record<FieldKind, string> = {
  text: '#38bdf8',
  number: '#818cf8',
  date: '#fbbf24',
  bool: '#34d399',
}

/** Teinte par famille d'agrégation. ⚠ Les mesures DÉCLARÉES par la source gardent l'indigo
 *  du module : ce sont les indicateurs de référence, pas une famille parmi d'autres. */
export const AGG_COLOR: Record<string, string> = {
  declared: '#818cf8',
  count: '#38bdf8',
  countDistinct: '#22d3ee',
  sum: '#a78bfa',
  avg: '#f472b6',
  median: '#fb923c',
  min: '#4ade80',
  max: '#f87171',
  filledPct: '#facc15',
}

/** Teinte par zone du constructeur : elle relie la puce posée à la zone qui la porte. */
export const WELL_COLOR: Record<WellId, string> = {
  axis: '#38bdf8',
  values: '#818cf8',
  legend: '#f472b6',
  tooltips: '#34d399',
  visualFilters: '#fbbf24',
}

/**
 * Teinte d'une barre de valeur, par UNITÉ de la colonne.
 *
 * ⚠⚠ La couleur dit ce qu'on MESURE, jamais si c'est bien ou mal : un décompte de ruptures
 * est bon pour l'acheteur et mauvais pour le vendeur, et le module ne sait pas de quel côté
 * on est. Un vert et un rouge côte à côte inventeraient ce jugement.
 * ⚠ Les mêmes teintes que les TYPES du volet des champs : une colonne en pourcentage se
 * reconnaît d'un écran à l'autre.
 */
const FORMAT_COLOR: Record<MeasureFormat, string> = {
  int: '#818cf8',
  float: '#818cf8',
  eur: '#34d399',
  pct: '#38bdf8',
  ms: '#fbbf24',
}

/** Valeur NÉGATIVE : convention comptable, factuelle et lue partout de la même façon. C'est
 *  le signe qu'elle dit — pas un jugement. */
const NEGATIVE_COLOR = '#f87171'

export function barColor(format: MeasureFormat | undefined, negative: boolean): string {
  if (negative) return NEGATIVE_COLOR
  return format ? FORMAT_COLOR[format] : FORMAT_COLOR.int
}

/** Fond dilué d'une teinte, pour une pastille ou un liseré. */
export const tinted = (color: string, alpha = '1a'): string => `${color}${alpha}`
