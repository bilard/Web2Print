// Ce qu'une SOURCE déclare : ses champs interrogeables et ses mesures.
//
// ⚠⚠ Une mesure difficile est DÉCLARÉE, jamais réimplémentée : `compute` appelle la
// fonction pure qui fait déjà autorité ailleurs dans l'application (médiane d'écart,
// durée de cycle, coût rattrapé). Un moteur générique qui recalculerait ces valeurs
// naïvement contredirait les écrans en place.
import type { SourceId } from '../types'
import type { TranslationKey } from '@/lib/i18n'

export type Row = Record<string, unknown>

export type FieldKind = 'text' | 'number' | 'date' | 'bool'

export interface Dimension {
  id: string
  labelKey: TranslationKey
  /** Libellé qui vient de la DONNÉE plutôt que du catalogue i18n (ex. le nom d'une colonne
   *  de feuille) — utilisé en priorité sur `labelKey` par le consommateur quand il est présent. */
  label?: string
  kind: FieldKind
  /** Valeur brute portée par la ligne. `null`/`undefined` = valeur absente, groupe à part. */
  get: (row: Row) => unknown
}

export type MeasureFormat = 'int' | 'float' | 'eur' | 'pct' | 'ms'

export interface Measure {
  id: string
  labelKey: TranslationKey
  /** Nom qui vient de la DONNÉE (la colonne agrégée), pas du catalogue i18n. Présent sur les
   *  mesures DÉRIVÉES : `labelKey` y porte alors l'agrégation (« Somme »), `label` la colonne
   *  (« Prix »). Le consommateur compose les deux (`bi.measure.derived`). */
  label?: string
  format: MeasureFormat
  /**
   * `false` pour une médiane, un pourcentage, un taux : additionner ou moyenner ces
   * valeurs entre groupes n'a pas de sens. Le constructeur refuse le geste (spec, risque 1).
   */
  aggregable: boolean
  /**
   * ⚠⚠ `null` = la valeur N'EXISTE PAS pour ce groupe (aucun nombre lisible pour une moyenne,
   * un minimum, une médiane). Jamais 0 : un zéro se lit comme une donnée. `formatMeasure`
   * rend « — ».
   */
  compute: (rows: Row[]) => number | null
}

export interface DataSource {
  id: SourceId
  labelKey: TranslationKey
  /** `client` : lignes chargées puis agrégées en mémoire. `server` / `snapshot` : lots 3+. */
  engine: 'client' | 'server' | 'snapshot'
  dimensions: Dimension[]
  measures: Measure[]
}
