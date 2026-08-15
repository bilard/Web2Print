// Faire changer de SOURCE des tuiles déjà posées. PUR.
//
// ⚠⚠ Une tuile ne bascule que si la source d'arrivée porte TOUS ses champs — mesures,
// dimensions, filtres, colonne de croisement. Basculer « à peu près » donnerait une tuile
// qui affiche des chiffres justes sur un autre sujet, ou qui tombe en « colonne inconnue »
// une fois rouverte : dans les deux cas, l'utilisateur a cliqué sur un menu et son tableau
// s'est abîmé sans un mot.
//
// ⚠⚠ Ce qui ne passe pas est NOMMÉ, tuile par tuile, avec le champ en cause. « 3 tuiles non
// converties » n'apprend rien ; « Écart médian par concurrent — champ absent : medGapPct »
// dit quoi faire.
import { isDerivedMeasure, measureKey, type MeasureRef, type SourceId, type Tile } from '../types'
import { allowedAggregations } from '../registry/aggregations'
import type { DataSource } from '../registry/types'

/** La source d'arrivée sait-elle calculer cette mesure ? */
function hasMeasure(ref: MeasureRef, source: DataSource): boolean {
  const key = measureKey({ ...ref, alias: undefined })
  if (source.measures.some((m) => m.id === key)) return true
  // Une mesure DÉRIVÉE peut se refabriquer, à condition que la colonne existe et que son
  // type autorise l'agrégation demandée — exactement ce que fait le moteur au calcul.
  if (!isDerivedMeasure(ref)) return false
  const dim = source.dimensions.find((d) => d.id === ref.field)
  return dim !== undefined && allowedAggregations(dim.kind).includes(ref.agg)
}

export interface Retargeted {
  /** Toutes les tuiles : celles qui ont basculé, et les autres INCHANGÉES. */
  tiles: Tile[]
  /** Combien ont réellement changé de source. */
  moved: number
  /** Ce qui n'a pas pu suivre, en clair : titre de la tuile et champ manquant. */
  blocked: { title: string; field: string }[]
}

export function retargetTiles(tiles: Tile[], target: SourceId, source: DataSource): Retargeted {
  const dims = new Set(source.dimensions.map((d) => d.id))
  const out: Tile[] = []
  const blocked: Retargeted['blocked'] = []
  let moved = 0

  for (const tile of tiles) {
    if (tile.query.source === target) { out.push(tile); continue }
    const q = tile.query
    // Premier champ manquant : c'est celui qu'on nomme. En lister dix n'aide pas davantage.
    const missing =
      q.measures.find((m) => !hasMeasure(m, source))
        ? measureKey(q.measures.find((m) => !hasMeasure(m, source))!)
        : q.dimensions.find((d) => !dims.has(d.id))?.id
          ?? q.filters.find((f) => !dims.has(f.field))?.field
          ?? (tile.options?.pivotColumn && !dims.has(tile.options.pivotColumn)
            ? tile.options.pivotColumn
            : undefined)
          ?? (q.tooltips?.some((m) => !hasMeasure(m, source))
            ? measureKey(q.tooltips.find((m) => !hasMeasure(m, source))!)
            : undefined)

    if (missing) {
      blocked.push({ title: tile.title || tile.id, field: missing })
      out.push(tile)
      continue
    }
    moved++
    out.push({ ...tile, query: { ...q, source: target } })
  }

  return { tiles: out, moved, blocked }
}
