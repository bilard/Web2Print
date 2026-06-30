// Champs calculés exposés aux RÈGLES CONDITIONNELLES (et à l'IA) : la remise, les
// prix numériques… qui n'existent pas tels quels dans les colonnes source mais sont
// dérivés (la remise affichée « -28% » vient du calcul prix barré/promo, pas d'une colonne).
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from './promoTypes'
import { extractPromoFields } from './promoMapping'

/** Colonnes synthétiques (clés préfixées `__` pour éviter toute collision). */
export const RULE_SYNTHETIC_COLUMNS: MergeColumn[] = [
  { key: '__remisePct', label: 'Remise (%)', fieldType: 'number' },
  { key: '__newPrice', label: 'Prix promo (nombre)', fieldType: 'number' },
  { key: '__oldPrice', label: 'Prix barré (nombre)', fieldType: 'number' },
]

/** Ligne enrichie des valeurs calculées, pour l'évaluation des règles. */
export function augmentRowForRules(
  row: MergeRow,
  columns: MergeColumn[],
  fieldMap: Partial<Record<PromoFieldKey, string>>,
): MergeRow {
  const f = extractPromoFields(row, columns, fieldMap)
  return {
    ...row,
    __remisePct: f.remisePct ?? '',
    __newPrice: f.newPrice ?? '',
    __oldPrice: f.oldPrice ?? '',
  }
}
