// src/features/excel/excelFormulas.test.ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { excelFormulaToColumnFormula, applyExcelFormulas } from './excelFormulas'
import { evaluateFormula } from './formulaEngine'
import type { ExcelColumn, ExcelRow } from './types'

const LETTERS = new Map([
  ['E', 'Prix_barré'],
  ['L', 'Prix_normal'],
])

describe('excelFormulaToColumnFormula', () => {
  it('traduit une formule arithmétique « même ligne » en réfs [Label]', () => {
    expect(excelFormulaToColumnFormula('(E2-L2)/E2', 2, LETTERS)).toBe(
      '([Prix_barré]-[Prix_normal])/[Prix_barré]',
    )
    expect(excelFormulaToColumnFormula('L7/1.5', 7, new Map([['L', 'Prix_normal']]))).toBe(
      '[Prix_normal]/1.5',
    )
  })

  it('rejette plage, réf absolue, autre feuille et réf hors-ligne', () => {
    expect(excelFormulaToColumnFormula('SUM(E2:E5)', 2, LETTERS)).toBeNull() // plage `:`
    expect(excelFormulaToColumnFormula('$E$2-L2', 2, LETTERS)).toBeNull() // absolu `$`
    expect(excelFormulaToColumnFormula('Sheet2!E2', 2, LETTERS)).toBeNull() // autre feuille `!`
    expect(excelFormulaToColumnFormula('E3-L2', 2, LETTERS)).toBeNull() // E3 ≠ ligne 2
    expect(excelFormulaToColumnFormula('ROUND(E2,2)', 2, LETTERS)).toBeNull() // fonction
  })
})

// --- Construction de feuilles XLSX synthétiques ------------------------------

interface DataRow {
  values: (number | string | null)[]
  formulas?: (string | null)[]
  errors?: boolean[]
}

function makeWorksheet(headers: string[], dataRows: DataRow[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}
  headers.forEach((h, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = { v: h, t: 's' }
  })
  dataRows.forEach((dr, ri) => {
    dr.values.forEach((v, c) => {
      if (v == null) return
      const cell: XLSX.CellObject = { v, t: typeof v === 'number' ? 'n' : 's' }
      if (dr.formulas?.[c]) cell.f = dr.formulas[c]!
      if (dr.errors?.[c]) cell.t = 'e'
      ws[XLSX.utils.encode_cell({ r: ri + 1, c })] = cell
    })
  })
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: dataRows.length, c: headers.length - 1 },
  })
  return ws
}

function makeColumns(headers: string[]): ExcelColumn[] {
  return headers.map((h, idx) => ({
    key: h,
    label: h,
    fieldType: 'number',
    detectedType: 'number',
    isPrimary: idx === 0,
    width: 120,
  }))
}

function makeRows(headers: string[], dataRows: DataRow[]): { rows: ExcelRow[]; rowNums: number[] } {
  const rows = dataRows.map((dr, ri) => {
    const row: ExcelRow = { _id: `row_${ri}` }
    headers.forEach((h, c) => {
      row[h] = (dr.values[c] ?? null) as ExcelRow[string]
    })
    return row
  })
  const rowNums = dataRows.map((_, ri) => ri + 1)
  return { rows, rowNums }
}

describe('applyExcelFormulas', () => {
  it('convertit une colonne uniforme « même ligne » en colonne formule (cas Promotion)', () => {
    const headers = ['Prix_barré', 'Prix_normal', 'Promotion']
    // Promotion = (E-L)/E sur chaque ligne ; valeur cachée = le calcul réel d'Excel.
    const data: DataRow[] = [
      { values: [327.78, 236, (327.78 - 236) / 327.78], formulas: [null, null, '(A2-B2)/A2'] },
      { values: [100, 75, (100 - 75) / 100], formulas: [null, null, '(A3-B3)/A3'] },
    ]
    const ws = makeWorksheet(headers, data)
    const columns = makeColumns(headers)
    const { rows, rowNums } = makeRows(headers, data)

    applyExcelFormulas(ws, columns, rows, rowNums)

    const promo = columns[2]
    expect(promo.fieldType).toBe('formula')
    expect(promo.formula).toBe('([Prix_barré]-[Prix_normal])/[Prix_barré]')
    // Le moteur natif reproduit bien la valeur (≈ 28 %).
    expect(evaluateFormula(promo.formula!, rows[0], columns)).toBeCloseTo(0.28, 4)
    // Les colonnes sources restent inchangées.
    expect(columns[0].fieldType).toBe('number')
  })

  it('NE convertit PAS une colonne dont le diviseur littéral varie par ligne (cas Unit_price)', () => {
    const headers = ['Prix_normal', 'Unit_price']
    const data: DataRow[] = [
      { values: [236, 236 / 1], formulas: [null, 'A2/1'] },
      { values: [73.15, 73.15 / 1.49], formulas: [null, 'A3/1.49'] },
    ]
    const ws = makeWorksheet(headers, data)
    const columns = makeColumns(headers)
    const { rows, rowNums } = makeRows(headers, data)

    applyExcelFormulas(ws, columns, rows, rowNums)

    expect(columns[1].fieldType).toBe('number')
    expect(columns[1].formula).toBeUndefined()
  })

  it('NE convertit PAS quand le moteur (sans priorité des opérateurs) ne reproduit pas la valeur Excel', () => {
    // =A+B*C : Excel = 2 + 3*4 = 14 ; le moteur évalue (2+3)*4 = 20 → écart → on garde les valeurs.
    const headers = ['A', 'B', 'C', 'R']
    const data: DataRow[] = [
      { values: [2, 3, 4, 14], formulas: [null, null, null, 'A2+B2*C2'] },
      { values: [1, 5, 2, 11], formulas: [null, null, null, 'A3+B3*C3'] },
    ]
    const ws = makeWorksheet(headers, data)
    const columns = makeColumns(headers)
    const { rows, rowNums } = makeRows(headers, data)

    applyExcelFormulas(ws, columns, rows, rowNums)

    expect(columns[3].fieldType).toBe('number')
    expect(columns[3].formula).toBeUndefined()
  })

  it('NE convertit PAS si une cellule non vide manque sa formule', () => {
    const headers = ['Prix_barré', 'Prix_normal', 'Promotion']
    const data: DataRow[] = [
      { values: [100, 75, 0.25], formulas: [null, null, '(A2-B2)/A2'] },
      { values: [200, 150, 0.25], formulas: [null, null, null] }, // valeur saisie à la main
    ]
    const ws = makeWorksheet(headers, data)
    const columns = makeColumns(headers)
    const { rows, rowNums } = makeRows(headers, data)

    applyExcelFormulas(ws, columns, rows, rowNums)

    expect(columns[2].fieldType).toBe('number')
  })
})
