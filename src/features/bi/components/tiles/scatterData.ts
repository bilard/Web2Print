// Du résultat d'agrégation aux séries du nuage de points 2D. PUR : ni React, ni chart.js.
//
// ⚠⚠ La LÉGENDE d'un nuage ne se comporte pas comme celle d'un graphe en barres : elle
// n'ajoute aucun jeu de données, elle COLORIE les points existants. Les deux mesures restent
// les deux axes ; la dimension de légende ne fait que les répartir en catégories.
import { paletteAt } from './palette'
import type { AggregateResult } from '../../engine/aggregate'

type ResultColumn = AggregateResult['columns'][number]

export interface ScatterPoint {
  x: number
  y: number
  /** Valeur de la dimension d'AXE : l'identité du point, montrée au survol. */
  label: string
}

export interface ScatterSeries {
  /** Valeur de la dimension de légende. Vide quand le nuage n'en porte pas. */
  label: string
  color: string
  points: ScatterPoint[]
}

export interface ScatterModel {
  series: ScatterSeries[]
  axes: { x: ResultColumn; y: ResultColumn }
  /**
   * Lignes ÉCARTÉES faute d'une des deux coordonnées.
   *
   * ⚠ Comptées puis dites à l'écran : un nuage silencieusement amputé se lit comme une
   * donnée complète, et c'est sur lui qu'on décide.
   */
  dropped: number
}

/**
 * Au-delà, la légende cesse d'informer : ⚠ une palette ne porte que dix teintes, et les
 * cycler ferait dire à deux catégories qu'elles sont la même. Les suivantes sont regroupées.
 */
export const MAX_SERIES = 10

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Le modèle du nuage, ou `null` faute des deux mesures — le composant le DIT plutôt que de
 * tracer une ligne de points alignés qui n'apprendrait rien.
 *
 * `otherLabel` nomme le regroupement des catégories au-delà de la dixième (déjà traduit).
 */
export function buildScatter(result: AggregateResult, otherLabel: string): ScatterModel | null {
  const measures = result.columns.filter((c) => c.role === 'measure')
  if (measures.length < 2) return null
  const [cx, cy] = measures
  const dimensions = result.columns.filter((c) => c.role === 'dimension')
  const axis = dimensions[0]
  // ⚠ La légende est la SECONDE dimension : la première nomme le point, jamais sa couleur.
  const legend = dimensions[1]

  const grouped = new Map<string, ScatterPoint[]>()
  let dropped = 0
  for (const row of result.rows) {
    const x = row[cx.key]
    const y = row[cy.key]
    // ⚠ Un point sans l'une de ses coordonnées n'est pas un point à l'origine : il est
    // ÉCARTÉ. Le placer en (0, 0) inventerait une observation.
    if (!isNum(x) || !isNum(y)) { dropped++; continue }
    const key = legend ? String(row[legend.key] ?? '') : ''
    const list = grouped.get(key)
    const point = { x, y, label: axis ? String(row[axis.key] ?? '') : '' }
    if (list) list.push(point)
    else grouped.set(key, [point])
  }

  // ⚠ Les catégories les plus PEUPLÉES gardent leur teinte : reléguer une grosse catégorie
  // dans « Autres » parce qu'elle arrive tard dans les lignes ferait disparaître l'essentiel.
  const entries = [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)
  const kept = entries.slice(0, MAX_SERIES)
  const rest = entries.slice(MAX_SERIES)
  const series: ScatterSeries[] = kept.map(([label, points], i) => ({
    label, color: paletteAt(i), points,
  }))
  if (rest.length > 0) {
    series.push({
      label: otherLabel,
      color: paletteAt(MAX_SERIES),
      points: rest.flatMap(([, points]) => points),
    })
  }
  return { series, axes: { x: cx, y: cy }, dropped }
}
