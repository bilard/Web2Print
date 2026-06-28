import * as XLSX from 'xlsx'
import type { ExcelColumn, ExcelRow, CellValue } from './types'
import { evaluateFormula } from './formulaEngine'

/**
 * Trace d'une colonne convertie : la formule Excel d'origine et son équivalent IBS Studio.
 * Éphémère (jamais persistée) — sert uniquement à animer la métamorphose à l'import.
 */
export interface FormulaConversion {
  /** Libellé de la colonne (ex. « Promotion »). */
  label: string
  /** Formule Excel brute de la 1re ligne, avec `=` (ex. `=(E2-L2)/E2`). */
  excelFormula: string
  /** Formule IBS Studio reconstruite (ex. `( [Prix_barré] - [Prix_normal] ) / [Prix_barré]`). */
  ibsFormula: string
  /** Valeur Excel cachée de la 1re ligne, pour afficher un résultat réel. */
  sampleResult: CellValue
}

/**
 * Préservation des formules Excel à l'import.
 *
 * Une colonne Excel dont chaque cellule porte une formule arithmétique « même ligne »
 * (ex. colonne « Promotion » = `=(E2-L2)/E2`) est convertie en colonne `formula` du
 * moteur natif, donc recalculée en direct quand l'utilisateur édite les colonnes sources.
 *
 * Deux cas :
 *  - Formule IDENTIQUE sur toutes les lignes → conversion directe (`Promotion`).
 *  - Même structure mais un littéral numérique VARIE par ligne (ex. `Unit_price` =
 *    `L2/1`, `L6/1.49`, `L14/15`…, où le diviseur est la quantité de conditionnement) →
 *    le littéral variable est EXTRAIT dans une nouvelle colonne réelle (ex.
 *    « Unit_price (diviseur) ») et la formule devient `[Prix_normal]/[Unit_price (diviseur)]`.
 *    Un littéral constant sur toutes les lignes reste inline (aucune colonne créée).
 *
 * Gardes (toutes nécessaires) :
 *  1. Références « même ligne » uniquement, sans `$`, `:` (plage) ni `!` (autre feuille).
 *  2. Structure (squelette) IDENTIQUE sur toutes les lignes non vides.
 *  3. Fidélité : le moteur natif doit reproduire la valeur Excel mise en cache (`.v`).
 *     Indispensable car le moteur évalue SANS priorité des opérateurs (`a+b*c` = `(a+b)*c`) :
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

// --- Tokenisation d'une formule traduite (refs `[Label]`, opérateurs, littéraux) -----

type Tok = { t: 'ref' | 'op' | 'lit'; v: string }

function tokenizeTranslated(s: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === '[') {
      const end = s.indexOf(']', i)
      if (end < 0) return [] // crochet non fermé → formule malformée
      toks.push({ t: 'ref', v: s.slice(i, end + 1) })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let n = ''
      while (i < s.length && /[0-9.]/.test(s[i])) {
        n += s[i]
        i++
      }
      toks.push({ t: 'lit', v: n })
      continue
    }
    if ('()+-*/'.includes(ch)) {
      toks.push({ t: 'op', v: ch })
      i++
      continue
    }
    return [] // caractère inattendu (ne devrait pas arriver après validation)
  }
  return toks
}

/** Clé structurelle : littéraux remplacés par `#`, le reste tel quel. */
function skeletonKey(toks: Tok[]): string {
  return toks.map((t) => (t.t === 'lit' ? '#' : t.v)).join('')
}

/** Rôle d'un littéral d'après l'opérateur qui le précède, pour nommer la colonne extraite. */
function roleForOp(op: string | undefined): string {
  switch (op) {
    case '/':
      return 'diviseur'
    case '*':
      return 'facteur'
    case '+':
    case '-':
      return 'terme'
    default:
      return 'param'
  }
}

function uniqueLabel(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n++
  return `${base} ${n}`
}

const FLOAT_TOLERANCE = 1e-9

function faithful(computed: CellValue, cached: CellValue): boolean {
  if (typeof cached === 'number') {
    const c = typeof computed === 'number' ? computed : Number(computed)
    if (!Number.isFinite(c)) return false
    return Math.abs(c - cached) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(cached))
  }
  return String(computed) === String(cached)
}

interface NewColumnSpec {
  label: string
  /** Valeur par index de ligne (aligné sur `rows`), `null` si la ligne n'a pas la formule. */
  values: (number | null)[]
}

interface ColumnConversion {
  formula: string
  newColumns: NewColumnSpec[]
}

/**
 * Tente de convertir une colonne en formule native, en extrayant si besoin les littéraux
 * variables dans de nouvelles colonnes. Retourne `null` si non convertible (gardes 1-3).
 */
function deriveColumnConversion(
  ws: XLSX.WorkSheet,
  letter: string,
  sourceLabel: string,
  rowNums: number[],
  colLetterToLabel: Map<string, string>,
  rows: ExcelRow[],
  columns: ExcelColumn[],
  takenLabels: Set<string>,
): ColumnConversion | null {
  // 1. Jetons traduits par ligne non vide.
  const perRow: { rowIndex: number; toks: Tok[] }[] = []
  for (let i = 0; i < rowNums.length; i++) {
    const cell = ws[letter + (rowNums[i] + 1)]
    if (!cell || cell.v == null || cell.v === '') continue // cellule vide tolérée
    if (cell.t === 'e') return null // cellule en erreur (#DIV/0…) : on ne convertit pas
    if (!cell.f) return null // cellule non vide SANS formule → pas une colonne formule
    const translated = excelFormulaToColumnFormula(String(cell.f), rowNums[i] + 1, colLetterToLabel)
    if (!translated) return null
    const toks = tokenizeTranslated(translated)
    if (!toks.length) return null
    perRow.push({ rowIndex: i, toks })
  }
  if (!perRow.length) return null

  // 2. Structure identique sur toutes les lignes.
  const key0 = skeletonKey(perRow[0].toks)
  for (const pr of perRow) {
    if (skeletonKey(pr.toks) !== key0) return null
  }

  // 3. Position de chaque littéral et classement constant / variable.
  const litPositions = perRow[0].toks
    .map((t, idx) => (t.t === 'lit' ? idx : -1))
    .filter((idx) => idx >= 0)
  const variable = litPositions.map((pos) => {
    const vals = new Set(perRow.map((pr) => parseFloat(pr.toks[pos].v)))
    return vals.size > 1
  })

  // 4. Colonnes extraites pour les littéraux variables.
  const newColumns: NewColumnSpec[] = []
  const varLabelByLit: (string | null)[] = litPositions.map(() => null)
  litPositions.forEach((pos, k) => {
    if (!variable[k]) return
    const before = pos > 0 ? perRow[0].toks[pos - 1] : undefined
    const role = roleForOp(before && before.t === 'op' ? before.v : undefined)
    const label = uniqueLabel(`${sourceLabel} (${role})`, takenLabels)
    takenLabels.add(label)
    varLabelByLit[k] = label
    const values: (number | null)[] = new Array(rows.length).fill(null)
    for (const pr of perRow) values[pr.rowIndex] = parseFloat(pr.toks[pos].v)
    newColumns.push({ label, values })
  })

  // 5. Reconstruction de la formule (littéral constant inline, variable → réf colonne).
  // Jetons séparés par des espaces : le moteur (`isExpressionFormula`) ne reconnaît le
  // mode expression que sur des jetons délimités par des espaces (sinon `[X]*1.2` est lu
  // comme un template texte au lieu d'un calcul).
  const parts: string[] = []
  let litIdx = 0
  for (const t of perRow[0].toks) {
    if (t.t === 'lit') {
      parts.push(variable[litIdx] ? `[${varLabelByLit[litIdx]}]` : t.v)
      litIdx++
    } else {
      parts.push(t.v)
    }
  }
  const formula = parts.join(' ')

  // 6. Garde de fidélité : le moteur reproduit-il la valeur Excel cachée ?
  const trialColumns: ExcelColumn[] = [
    ...columns,
    ...newColumns.map((nc) => ({
      key: nc.label,
      label: nc.label,
      fieldType: 'number' as const,
      detectedType: 'number' as const,
      isPrimary: false,
      width: 120,
    })),
  ]
  for (const pr of perRow) {
    const cached = ws[letter + (rowNums[pr.rowIndex] + 1)].v as CellValue
    const trialRow: ExcelRow = { ...rows[pr.rowIndex] }
    for (const nc of newColumns) trialRow[nc.label] = nc.values[pr.rowIndex]
    if (!faithful(evaluateFormula(formula, trialRow, trialColumns), cached)) return null
  }

  return { formula, newColumns }
}

/**
 * Détecte les colonnes-formules Excel et les convertit en colonnes `formula` natives,
 * en créant au besoin des colonnes pour les littéraux variables. Mute `columns` et `rows`
 * en place. `rowNums[i]` = index de ligne (0-based) dans la feuille pour `rows[i]`.
 */
export function applyExcelFormulas(
  ws: XLSX.WorkSheet,
  columns: ExcelColumn[],
  rows: ExcelRow[],
  rowNums: number[],
  report?: FormulaConversion[],
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

  const takenLabels = new Set(columns.map((c) => c.label))
  // On itère sur un instantané : les insertions de colonnes ne décalent pas la boucle.
  const sourceColumns = [...columns]

  for (const col of sourceColumns) {
    const letter = labelToColLetter.get(col.label)
    if (!letter) continue
    const conv = deriveColumnConversion(
      ws,
      letter,
      col.label,
      rowNums,
      colLetterToLabel,
      rows,
      columns,
      takenLabels,
    )
    if (!conv) continue

    // Insérer les nouvelles colonnes juste avant la colonne formule + remplir les lignes.
    for (const nc of conv.newColumns) {
      const newCol: ExcelColumn = {
        key: nc.label,
        label: nc.label,
        fieldType: 'number',
        detectedType: 'number',
        isPrimary: false,
        width: Math.max(120, Math.min(300, nc.label.length * 10 + 40)),
      }
      const at = columns.indexOf(col)
      columns.splice(at, 0, newCol)
      rows.forEach((row, i) => {
        row[nc.label] = nc.values[i]
      })
    }

    col.fieldType = 'formula'
    col.formula = conv.formula

    // Trace pour l'animation : 1re ligne portant réellement une formule Excel.
    if (report) {
      for (let i = 0; i < rowNums.length; i++) {
        const cell = ws[letter + (rowNums[i] + 1)]
        if (cell?.f) {
          report.push({
            label: col.label,
            excelFormula: '=' + String(cell.f).replace(/^=/, ''),
            ibsFormula: conv.formula,
            sampleResult: (cell.v ?? null) as CellValue,
          })
          break
        }
      }
    }
  }
}
