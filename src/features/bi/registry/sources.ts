// Point d'entrée UNIQUE des sources. Le constructeur, le moteur et le prompt lisent ici —
// une source absente d'ici n'existe pas pour le module.
import type { SourceId } from '../types'
import type { DataSource } from './types'
import { pimSource } from './pim.source'

export const ALL_SOURCES: DataSource[] = [pimSource]

export function getSource(id: SourceId): DataSource {
  const s = ALL_SOURCES.find((x) => x.id === id)
  // Lever plutôt que rendre une source vide : une tuile sans source doit le DIRE.
  if (!s) throw new Error(`Source inconnue : ${id}`)
  return s
}
