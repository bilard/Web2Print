// Du résultat d'agrégation à l'indicateur. PUR : ni React, ni i18n.
//
// ⚠⚠ Un indicateur SANS dimension montre une valeur, c'est tout. Avec une dimension, il en
// montre la DERNIÈRE et dit d'où elle vient : la variation depuis le point précédent et la
// courbe de la série. C'est ce qui distingue « 534 735 fiches » d'un chiffre qui monte.
import type { AggregateResult } from '../../engine/aggregate'

type ResultColumn = AggregateResult['columns'][number]

export interface KpiModel {
  /** La valeur en grand. `null` = rien à montrer (aucune ligne, ou valeur non numérique). */
  value: number | null
  measure?: ResultColumn
  /**
   * Points de la série, dans l'ordre de la dimension. Vide quand l'indicateur n'a pas d'axe.
   * ⚠ Toujours au moins deux points quand elle est présente : une « tendance » d'un seul
   * point est une ligne plate qui laisserait croire à une stabilité jamais observée.
   */
  series: number[]
  /** Valeur du point PRÉCÉDENT, pour la variation. */
  previous?: number
  /**
   * Valeur de la dimension au point précédent — celle à laquelle on compare.
   *
   * ⚠⚠ Affichée à côté de la variation, toujours. Un « +12 % » sans dire par rapport à QUOI
   * laisse croire à une évolution dans le temps, alors que la dimension peut être une marque
   * ou une famille : la comparaison serait alors entre deux voisins d'un classement.
   */
  previousLabel?: string
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * L'indicateur, tendance comprise.
 *
 * ⚠⚠ La série est RETRIÉE sur la dimension, jamais laissée dans l'ordre du résultat : une
 * tuile triée sur sa mesure (un « top 10 ») donnerait une courbe classée du plus grand au
 * plus petit — une décroissance parfaite, qui n'est pas une tendance mais un tri.
 */
export function buildKpi(result: AggregateResult): KpiModel {
  const measure = result.columns.find((c) => c.role === 'measure')
  const dimension = result.columns.find((c) => c.role === 'dimension')
  if (!measure) return { value: null, series: [] }

  if (!dimension) {
    const raw = result.rows[0]?.[measure.key] ?? null
    return { value: isNum(raw) ? raw : null, measure, series: [] }
  }

  const points = result.rows
    .map((row) => ({ key: String(row[dimension.key] ?? ''), value: row[measure.key] }))
    .filter((p): p is { key: string; value: number } => isNum(p.value))
    .sort((a, b) => a.key.localeCompare(b.key, 'fr'))

  const last = points.at(-1)
  const before = points.at(-2)
  return {
    value: last?.value ?? null,
    measure,
    // Un seul point ne fait pas une courbe : on n'en trace aucune.
    series: points.length >= 2 ? points.map((p) => p.value) : [],
    previous: before?.value,
    previousLabel: before?.key,
  }
}

/**
 * Variation relative entre deux valeurs, en part de la précédente (0,12 = +12 %).
 *
 * ⚠⚠ `null` quand la précédente vaut ZÉRO : la variation y est infinie, et l'afficher
 * « +∞ % » — ou pire, « +100 % » — inventerait un chiffre. On montre alors l'écart brut.
 */
export function kpiDelta(value: number, previous: number): number | null {
  if (previous === 0) return null
  return (value - previous) / Math.abs(previous)
}
