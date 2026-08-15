// Point d'entrée UNIQUE des sources. Le constructeur, le moteur et le prompt lisent ici —
// une source absente d'ici n'existe pas pour le module.
import type { SourceId } from '../types'
import type { DataSource } from './types'
import { pimSource } from './pim.source'
import { WATCH_SOURCES } from './watch.source'

const ALL_SOURCES: DataSource[] = [pimSource, ...WATCH_SOURCES]

/** Toutes les sources déclarées. ⚠ C'est LA liste que le prompt propose au modèle : une
 *  source absente d'ici lui est invisible, quelle que soit la demande. */
export function listSources(): DataSource[] {
  return ALL_SOURCES
}

/** L'identifiant désigne-t-il une source déclarée ? ⚠ Le modèle en RÉPOND une : sans cette
 *  garde, une chaîne inventée atteindrait `getSource`, qui lève. */
export function isSourceId(id: string): id is SourceId {
  return ALL_SOURCES.some((s) => s.id === id)
}

export function getSource(id: SourceId): DataSource {
  const s = ALL_SOURCES.find((x) => x.id === id)
  // Lever plutôt que rendre une source vide : une tuile sans source doit le DIRE.
  if (!s) throw new Error(`Source inconnue : ${id}`)
  return s
}
