// Les mesures, rangées par TYPE. PUR.
//
// ⚠⚠ Une source de veille en déclare sept et en dérive plus de cent : sept agrégations sur
// dix-sept colonnes. En liste plate, « Somme · Prix » se perd entre « Moyenne · Écart » et
// « Taux de remplissage · Référence », et on renonce à chercher. Regroupées par type —
// décomptes, sommes, moyennes… — on va droit à la famille qu'on veut.
//
// ⚠ Les mesures DÉCLARÉES par la source passent en tête, dans leur ordre d'origine : ce sont
// celles que le métier a nommées (« Produits appariés », « Écart médian »), et un moteur
// générique les calculerait faux. Les noyer dans les dérivées les rendrait introuvables.
import { AGGREGATIONS, type Aggregation } from '../types'
import type { Measure } from './types'
import type { TranslationKey } from '@/lib/i18n'

export interface MeasureGroup {
  /** Clé stable : `declared`, ou le nom de l'agrégation. */
  key: string
  /** Libellé du groupe, à traduire par l'appelant. */
  labelKey: TranslationKey
  measures: Measure[]
}

/** L'agrégation d'une mesure dérivée, `null` si la source l'a déclarée elle-même. */
function aggregationOf(id: string): Aggregation | null {
  const cut = id.indexOf(':')
  if (cut <= 0) return null
  const head = id.slice(0, cut)
  return (AGGREGATIONS as readonly string[]).includes(head) ? (head as Aggregation) : null
}

export function groupMeasures(measures: Measure[]): MeasureGroup[] {
  const declared: Measure[] = []
  const byAgg = new Map<Aggregation, Measure[]>()

  for (const m of measures) {
    const agg = aggregationOf(m.id)
    if (agg === null) { declared.push(m); continue }
    const list = byAgg.get(agg)
    if (list) list.push(m)
    else byAgg.set(agg, [m])
  }

  const groups: MeasureGroup[] = []
  if (declared.length > 0) {
    groups.push({ key: 'declared', labelKey: 'bi.fields.declared', measures: declared })
  }
  // ⚠ L'ordre des groupes suit `AGGREGATIONS`, pas l'ordre de rencontre : deux sources
  // rangeraient sinon leurs mesures différemment, et l'œil devrait réapprendre à chaque fois.
  for (const agg of AGGREGATIONS) {
    const list = byAgg.get(agg)
    if (list?.length) groups.push({ key: agg, labelKey: `bi.agg.${agg}` as TranslationKey, measures: list })
  }
  return groups
}
