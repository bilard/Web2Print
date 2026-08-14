// Les mesures ne s'écrivent plus à la main : elles se DÉRIVENT des colonnes de la donnée.
//
// ⚠ Une source déclare trois mesures ; un catalogue de 21 colonnes en permet une centaine.
// C'est le carburant du constructeur (spec lot 2, D1).
import { measureKey, type Aggregation } from '../types'
import { aggregationFormat, allowedAggregations, computeAggregation, isAggregable } from './aggregations'
import type { FieldKind, Measure, MeasureFormat, Row } from './types'

/** Ce dont la dérivation a besoin d'une colonne — et rien de plus : ni Excel, ni PIM, ni
 *  veille tarifaire, pour que les sources des lots suivants s'y branchent telles quelles. */
export interface DerivableColumn {
  key: string
  /** Nom RÉEL de la colonne, tel que l'utilisateur le lit dans ses données. */
  label: string
  kind: FieldKind
  /** Unité de la colonne (monnaie, pourcentage) quand elle est connue. */
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
    for (const agg of allowedAggregations(col.kind)) {
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
    derivedFrom: { field: col.key, agg },
    format: aggregationFormat(agg, col.format),
    aggregable: isAggregable(agg),
    compute: (rows: Row[]) => computeAggregation(rows, col.key, agg),
  }
}
