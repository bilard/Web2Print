// Score de complétude d'une ligne : % de colonnes visibles réellement remplies.
// Pure (testable) — utilisé par DataTable pour la pastille par ligne et la moyenne globale.
import type { ExcelRow, ExcelColumn, CellValue } from './types'

export interface Completeness {
  filled: number
  total: number
  /** 0-100, arrondi. 100 si aucune colonne évaluable. */
  pct: number
  /** Labels des colonnes vides (pour le tooltip). */
  missing: string[]
}

/** Une valeur est « remplie » si non nulle et non chaîne vide/blanche. */
function isFilled(v: CellValue | undefined): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Complétude d'une ligne sur les colonnes données. Les colonnes formule sont
 * exclues (valeur calculée, pas une donnée à saisir).
 */
export function rowCompleteness(row: ExcelRow, columns: ExcelColumn[]): Completeness {
  const evaluable = columns.filter((c) => c.fieldType !== 'formula')
  const missing: string[] = []
  let filled = 0
  for (const col of evaluable) {
    if (isFilled(row[col.key])) filled++
    else missing.push(col.label || col.key)
  }
  const total = evaluable.length
  return {
    filled,
    total,
    pct: total === 0 ? 100 : Math.round((filled / total) * 100),
    missing,
  }
}

/** Moyenne (arrondie) des complétudes d'un ensemble de lignes. 100 si vide. */
export function averageCompleteness(rows: ExcelRow[], columns: ExcelColumn[]): number {
  if (rows.length === 0) return 100
  const sum = rows.reduce((acc, r) => acc + rowCompleteness(r, columns).pct, 0)
  return Math.round(sum / rows.length)
}

/** Couleur de pastille selon le score : vert ≥ 90, ambre ≥ 60, rouge sinon. */
export function completenessTone(pct: number): 'emerald' | 'amber' | 'red' {
  if (pct >= 90) return 'emerald'
  if (pct >= 60) return 'amber'
  return 'red'
}
