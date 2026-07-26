// Fraîcheur par champ des produits PIM : chaque ProductField porte un
// `updatedAt` (stampé au merge quand la valeur CHANGE — mergeStrategy.ts) ;
// pimProductsToSheet le transporte dans `row._fieldUpdatedAt` et DataTable
// affiche une pastille d'âge sur les cellules périmées. Pure (testable).
import type { ExcelRow } from './types'

/** Clé spéciale au niveau ligne (même convention que `_id` : jamais une colonne). */
export const FIELD_UPDATED_AT_KEY = '_fieldUpdatedAt'

const STALE_DAYS = 30
const VERY_STALE_DAYS = 90

export type FreshnessTone = 'amber' | 'red'

/** Âge en jours entiers (floor). */
export function fieldAgeDays(updatedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - updatedAt) / 86_400_000))
}

/** Ton de pastille : null = frais (aucune pastille), amber ≥ 30 j, red ≥ 90 j. */
export function freshnessTone(ageDays: number): FreshnessTone | null {
  if (ageDays >= VERY_STALE_DAYS) return 'red'
  if (ageDays >= STALE_DAYS) return 'amber'
  return null
}

/** Timestamps par champ d'une ligne (vide pour les sheets Excel classiques). */
export function rowFieldTimestamps(row: ExcelRow): Record<string, number> {
  const raw = (row as Record<string, unknown>)[FIELD_UPDATED_AT_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, number>
}

/** Pastille d'une cellule : null si pas de timestamp (donnée non-PIM) ou frais. */
export function cellFreshness(
  row: ExcelRow,
  columnKey: string,
  now: number,
): { ageDays: number; tone: FreshnessTone } | null {
  const ts = rowFieldTimestamps(row)[columnKey]
  if (typeof ts !== 'number' || ts <= 0) return null
  const ageDays = fieldAgeDays(ts, now)
  const tone = freshnessTone(ageDays)
  return tone ? { ageDays, tone } : null
}
