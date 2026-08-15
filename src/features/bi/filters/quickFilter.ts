// Sur QUOI porte le filtre d'un coup d'œil. PUR.
//
// ⚠ Une seule dimension est proposée : celle qui découpe le tableau de la façon la plus
// parlante. Sur la veille, c'est le concurrent — la question qu'on pose d'abord à un écran
// de comparaison. En offrir dix ferait du bandeau un second volet de filtres, qui existe
// déjà et qui a la place.
import { getSource } from '../registry/sources'
import type { SourceId } from '../types'

/** Dimensions candidates, par ordre de préférence. */
const PREFERRED = ['domain'] as const

export interface QuickFilterTarget {
  sourceId: SourceId
  field: string
}

/**
 * La première source AFFICHÉE qui porte l'une des dimensions candidates.
 *
 * ⚠ Parmi les sources RÉELLEMENT lues (`demanded`), jamais celle simplement sélectionnée
 * pour la prochaine tuile : un filtre posé sur une source que l'écran ne lit pas ne
 * changerait rien, et se lirait comme un réglage sans effet.
 */
export function quickFilterTarget(demanded: readonly SourceId[]): QuickFilterTarget | null {
  for (const id of demanded) {
    const source = getSource(id)
    const field = PREFERRED.find((f) => source.dimensions.some((d) => d.id === f))
    if (field) return { sourceId: id, field }
  }
  return null
}
