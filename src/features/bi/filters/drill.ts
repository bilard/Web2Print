// Le FORAGE : descendre d'un niveau dans une hiérarchie de dimensions, et remonter. PUR.
//
// ⚠ Descendre, ce n'est pas seulement changer d'axe : c'est changer d'axe ET retenir la
// valeur qu'on vient de cliquer. Sans ce filtre, « Famille » afficherait toutes les familles
// de tous les univers — l'utilisateur croirait avoir foré alors qu'il a seulement changé de
// regroupement, et lirait des chiffres qui ne correspondent pas à ce qu'il a cliqué.
import type { FilterClause, QuerySpec } from '../types'
import { upsertFilter, removeFilter } from './filterOptions'

/** Un niveau franchi : la dimension quittée et la valeur qui l'a filtrée. */
export interface DrillStep {
  field: string
  value: string | null
}

/** Hiérarchies connues, dans l'ordre du plus général au plus fin. */
const DRILL_PATHS: readonly (readonly string[])[] = [
  ['taxo.1', 'taxo.2', 'taxo.3', 'taxo.4'],
]

/**
 * Le niveau suivant d'une dimension, s'il existe dans une hiérarchie déclarée — ou dans le
 * `drillPath` que la tuile porte elle-même, qui prime.
 */
export function nextLevel(field: string, custom?: readonly string[]): string | null {
  const paths = custom?.length ? [custom, ...DRILL_PATHS] : DRILL_PATHS
  for (const path of paths) {
    const i = path.indexOf(field)
    if (i >= 0 && i < path.length - 1) return path[i + 1]
  }
  return null
}

/**
 * Descend d'un niveau : la dimension d'axe devient la suivante, et la valeur cliquée
 * devient un filtre. Rend `null` quand il n'y a pas de niveau en dessous — l'appelant sait
 * alors qu'il ne peut pas forer, plutôt que de produire une requête identique qui donnerait
 * l'impression d'un geste sans effet.
 */
export function drillDown(
  query: QuerySpec, value: string | null, custom?: readonly string[],
): { query: QuerySpec; step: DrillStep } | null {
  const axis = query.dimensions[0]
  if (!axis) return null
  const next = nextLevel(axis.id, custom)
  if (!next) return null
  return {
    query: {
      ...query,
      dimensions: [{ id: next }, ...query.dimensions.slice(1)],
      filters: upsertFilter(query.filters, { field: axis.id, op: 'eq', value }),
    },
    step: { field: axis.id, value },
  }
}

/**
 * Remonte au niveau d'un pas franchi : l'axe redevient la dimension quittée et son filtre
 * disparaît. ⚠ Les pas plus profonds que celui visé sont défaits eux aussi — remonter à
 * l'univers en gardant un filtre de famille afficherait un total amputé sous un intitulé
 * qui promet l'ensemble.
 */
export function drillUp(
  query: QuerySpec, steps: readonly DrillStep[], toIndex: number,
): { query: QuerySpec; steps: DrillStep[] } {
  const kept = steps.slice(0, toIndex)
  const undone = steps.slice(toIndex)
  if (undone.length === 0) return { query, steps: [...kept] }
  const target = undone[0]
  let filters: FilterClause[] = query.filters
  for (const s of undone) filters = removeFilter(filters, s.field, 'eq')
  return {
    query: {
      ...query,
      dimensions: [{ id: target.field }, ...query.dimensions.slice(1)],
      filters,
    },
    steps: kept,
  }
}

/**
 * Rejoue une suite de pas sur une requête : l'axe descend d'autant de niveaux, et chaque
 * valeur franchie redevient un filtre.
 *
 * ⚠ Sert à recomposer l'état courant d'une tuile forée SANS le persister — le forage est une
 * exploration, la requête enregistrée reste celle que l'utilisateur a configurée.
 */
export function applyDrill(query: QuerySpec, steps: readonly DrillStep[]): QuerySpec {
  let out = query
  for (const s of steps) {
    const next = drillDown(out, s.value)
    if (!next) return out
    out = next.query
  }
  return out
}
