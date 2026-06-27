import * as XLSX from 'xlsx'
import type { ExcelColumn, ExcelRow, CellValue } from './types'
import { evaluateFormula } from './formulaEngine'

/**
 * Préservation des formules Excel à l'import.
 *
 * Une colonne Excel dont toutes les cellules portent la MÊME formule arithmétique
 * « même ligne » (ex. colonne « Promotion » = `=(E2-L2)/E2`) est convertie en colonne
 * de type `formula` du moteur natif, donc recalculée en direct quand l'utilisateur édite
 * les colonnes sources. Les colonnes dont la formule varie par ligne (ex. un diviseur
 * littéral différent à chaque ligne : `L2/1`, `L6/1.49`…) ne sont PAS convertibles en
 * formule colonne unique : on conserve alors les valeurs calculées (comportement existant).
 *
 * Trois gardes, complémentaires :
 *  1. Références « même ligne » uniquement, sans `$`, `:` (plage) ni `!` (autre feuille).
 *  2. Formule canonique IDENTIQUE sur toutes les lignes non vides de la colonne.
 *  3. Fidélité : le moteur natif doit reproduire la valeur Excel mise en cache (`.v`).
 *     Indispensable car le moteur évalue sans priorité des opérateurs (`a+b*c` = `(a+b)*c`) :
 *     sans cette garde, `=A2+B2*C2` se convertirait en affichant d'autres nombres que le
 *     tableur. En cas d'écart, on garde les valeurs statiques — le résultat sûr.
 */

/**
 * Traduit UNE formule Excel A1 (sans le `=` initial) vers la syntaxe `[Label]` du moteur.
 * Retourne `null` si ce n'est pas une expression arithmétique « même ligne » reproductible.
 */
export function excelFormulaToColumnFormula(
  formula: string,
  cellRow1: number,
  colLetterToLabel: Map<string, string>,
): string | null {
  const f = formula.trim().replace(/^=/, '')
  if (!f) return null
  // Réf croisée (`!`), plage (`:`) ou réf absolue (`$`) : impossible à modéliser par ligne.
  if (/[!:$]/.test(f)) return null

  let ok = true
  const replaced = f.replace(/([A-Za-z]{1,3})(\d+)/g, (m, letters: string, digits: string) => {
    const row = parseInt(digits, 10)
    const label = colLetterToLabel.get(letters.toUpperCase())
    // La réf doit pointer sur la ligne de la cellule elle-même, et la colonne doit exister.
    if (row !== cellRow1 || !label) {
      ok = false
      return m
    }
    return `[${label}]`
  })
  if (!ok) return null

  // Hors des références `[Label]`, seuls des jetons arithmétiques peuvent subsister.
  // Tout résidu (nom de fonction Excel, plage nommée…) disqualifie la colonne.
  const residue = replaced.replace(/\[[^\]]+\]/g, '').replace(/[0-9.+\-*/() \t]/g, '')
  if (residue) return null

  return replaced
}

/** Formule canonique commune à toute la colonne, ou `null` si non convertible. */
function deriveCanonicalFormula(
  ws: XLSX.WorkSheet,
  letter: string,
  rowNums: number[],
  colLetterToLabel: Map<string, string>,
): string | null {
  let canonical: string | null = null
  let saw = false
  for (const rn of rowNums) {
    const cell = ws[letter + (rn + 1)]
    if (!cell || cell.v == null || cell.v === '') continue // cellule vide tolérée
    if (cell.t === 'e') return null // cellule en erreur (#DIV/0…) : on ne convertit pas
    if (!cell.f) return null // cellule non vide SANS formule → pas une colonne formule
    const translated = excelFormulaToColumnFormula(String(cell.f), rn + 1, colLetterToLabel)
    if (!translated) return null
    if (canonical === null) {
      canonical = translated
      saw = true
    } else if (canonical !== translated) {
      return null
    }
  }
  return saw ? canonical : null
}

const FLOAT_TOLERANCE = 1e-9

/** La garde de fidélité : le moteur natif reproduit-il les valeurs Excel mises en cache ? */
function formulaMatchesCachedValues(
  formula: string,
  rows: ExcelRow[],
  columns: ExcelColumn[],
  ws: XLSX.WorkSheet,
  letter: string,
  rowNums: number[],
): boolean {
  for (let i = 0; i < rows.length; i++) {
    const cell = ws[letter + (rowNums[i] + 1)]
    if (!cell || cell.v == null || cell.v === '') continue
    const cached = cell.v as CellValue
    const computed = evaluateFormula(formula, rows[i], columns)
    if (typeof cached === 'number') {
      const c = typeof computed === 'number' ? computed : Number(computed)
      if (!Number.isFinite(c)) return false
      if (Math.abs(c - cached) > FLOAT_TOLERANCE * Math.max(1, Math.abs(cached))) return false
    } else if (String(computed) !== String(cached)) {
      return false
    }
  }
  return true
}

/**
 * Détecte les colonnes-formules Excel et les convertit en colonnes `formula` natives.
 * Mute `columns` en place. `rowNums[i]` = index de ligne (0-based) dans la feuille pour `rows[i]`.
 */
export function applyExcelFormulas(
  ws: XLSX.WorkSheet,
  columns: ExcelColumn[],
  rows: ExcelRow[],
  rowNums: number[],
): void {
  if (!ws['!ref']) return
  const range = XLSX.utils.decode_range(ws['!ref'])
  const headerRow0 = range.s.r

  const colLetterToLabel = new Map<string, string>()
  const labelToColLetter = new Map<string, string>()
  for (let C = range.s.c; C <= range.e.c; C++) {
    const letter = XLSX.utils.encode_col(C)
    const hc = ws[XLSX.utils.encode_cell({ r: headerRow0, c: C })]
    const label = hc && hc.v != null ? String(hc.v) : ''
    if (!label) continue
    colLetterToLabel.set(letter, label)
    if (!labelToColLetter.has(label)) labelToColLetter.set(label, letter)
  }

  for (const col of columns) {
    const letter = labelToColLetter.get(col.label)
    if (!letter) continue
    const canonical = deriveCanonicalFormula(ws, letter, rowNums, colLetterToLabel)
    if (!canonical) continue
    if (!formulaMatchesCachedValues(canonical, rows, columns, ws, letter, rowNums)) continue
    col.fieldType = 'formula'
    col.formula = canonical
  }
}
