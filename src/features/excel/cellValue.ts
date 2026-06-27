import type { ExcelColumn, CellValue } from './types'
import { evaluateFormula } from './formulaEngine'

/**
 * Valeur effective d'une cellule — source unique pour l'affichage, la fusion et l'export.
 *
 * - colonne `formula` : évalue la formule sur la ligne ;
 * - `formulaResultType === 'percent'` : applique le facteur ×100 (un ratio 0,28 devient 28) ;
 * - sinon : renvoie la valeur brute stockée.
 *
 * Le suffixe « % » et le formatage des décimales restent à la charge de chaque rendu
 * (l'UI affiche « 28 % », l'export/la fusion écrivent le nombre brut 28 pour rester calculable).
 */
export function cellValue(
  col: ExcelColumn,
  row: Record<string, CellValue>,
  columns: ExcelColumn[],
): CellValue {
  if (col.fieldType === 'formula' && col.formula) {
    const raw = evaluateFormula(col.formula, row, columns)
    if (col.formulaResultType === 'percent') {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (Number.isFinite(n)) return n * 100
    }
    return raw
  }
  return row[col.key] ?? null
}
