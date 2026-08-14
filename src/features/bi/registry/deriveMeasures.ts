// Les mesures ne s'écrivent plus à la main : elles se DÉRIVENT des colonnes de la donnée.
//
// ⚠ Une source déclare trois mesures ; un catalogue de 21 colonnes en permet une centaine.
// C'est le carburant du constructeur (spec lot 2, D1).
import { measureKey, type Aggregation } from '../types'
import { aggregationFormat, allowedAggregationsFor, computeAggregation, isAggregableFor } from './aggregations'
import type { FieldKind, Measure, MeasureFormat, Row } from './types'
import type { TranslationKey } from '@/lib/i18n'

/** Ce dont la dérivation a besoin d'une colonne — et rien de plus : ni Excel, ni PIM, ni
 *  veille tarifaire, pour que les sources des lots suivants s'y branchent telles quelles. */
export interface DerivableColumn {
  key: string
  /** Nom RÉEL de la colonne, tel que l'utilisateur le lit dans SES données (feuille, PIM). */
  label?: string
  /** Nom de la colonne au CATALOGUE i18n, pour les sources déclarées en dur (veille) dont
   *  les colonnes ne portent aucun nom saisi par l'utilisateur. L'un ou l'autre, jamais les
   *  deux : `label` vient de la donnée et prime toujours. */
  labelKey?: TranslationKey
  kind: FieldKind
  /** Unité de la colonne (monnaie, pourcentage, durée) quand elle est connue. */
  format?: MeasureFormat
}

/**
 * Pour chaque colonne, les agrégations que son TYPE autorise : sommes, moyennes, médianes,
 * extrema sur les colonnes numériques seulement ; décompte, valeurs distinctes et taux de
 * remplissage partout.
 *
 * ⚠ L'identifiant est `agg:field` — exactement la clé que `measureKey` calcule pour une
 * `MeasureRef` dérivée. Les faire diverger casserait le tri (`sort.by` désigne cette clé) et
 * la reprise d'une tuile enregistrée.
 */
export function deriveMeasures(columns: DerivableColumn[]): Measure[] {
  const out: Measure[] = []
  for (const col of columns) {
    for (const agg of allowedAggregationsFor(col.kind, col.format)) {
      out.push(measureOf(col, agg))
    }
  }
  return out
}

/** Une mesure dérivée, seule. Utilisée aussi par le moteur pour exécuter une `MeasureRef`. */
export function measureOf(col: DerivableColumn, agg: Aggregation): Measure {
  return {
    id: measureKey({ field: col.key, agg }),
    // ⚠ L'agrégation est traduite (catalogue), la colonne ne l'est pas (elle vient de la
    // donnée) : le composant compose les deux.
    labelKey: `bi.agg.${agg}` as Measure['labelKey'],
    label: col.label,
    columnKey: col.labelKey,
    derivedFrom: { field: col.key, agg },
    format: aggregationFormat(agg, col.format),
    aggregable: isAggregableFor(agg, col.format),
    compute: (rows: Row[]) => computeAggregation(rows, col.key, agg),
  }
}
