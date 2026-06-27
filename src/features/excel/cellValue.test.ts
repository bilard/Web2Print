// src/features/excel/cellValue.test.ts
import { describe, it, expect } from 'vitest'
import { cellValue } from './cellValue'
import type { ExcelColumn, ExcelRow } from './types'

const PROMO_FORMULA = '( [Prix_barré] - [Prix_normal] ) / [Prix_barré]'

function columns(resultType: ExcelColumn['formulaResultType']): ExcelColumn[] {
  return [
    { key: 'Prix_barré', label: 'Prix_barré', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
    { key: 'Prix_normal', label: 'Prix_normal', fieldType: 'number', detectedType: 'number', isPrimary: false, width: 100 },
    { key: 'Promotion', label: 'Promotion', fieldType: 'formula', detectedType: 'number', isPrimary: false, width: 100, formula: PROMO_FORMULA, formulaResultType: resultType },
  ]
}

const row: ExcelRow = { _id: 'r1', 'Prix_barré': 100, 'Prix_normal': 72, Promotion: 0.28 }

describe('cellValue', () => {
  it('« pourcentage » multiplie le ratio par 100 (0,28 → 28)', () => {
    const cols = columns('percent')
    expect(cellValue(cols[2], row, cols)).toBeCloseTo(28, 9)
  })

  it('« nombre » garde le ratio brut évalué (0,28)', () => {
    const cols = columns('number')
    expect(cellValue(cols[2], row, cols)).toBeCloseTo(0.28, 9)
  })

  it('colonne non-formule renvoie la valeur brute stockée', () => {
    const cols = columns('auto')
    expect(cellValue(cols[0], row, cols)).toBe(100)
  })
})
