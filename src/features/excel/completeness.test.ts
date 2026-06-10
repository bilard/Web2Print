// src/features/excel/completeness.test.ts
import { describe, it, expect } from 'vitest'
import { rowCompleteness, averageCompleteness, completenessTone } from './completeness'
import type { ExcelColumn, ExcelRow } from './types'

const col = (key: string, fieldType: ExcelColumn['fieldType'] = 'text'): ExcelColumn =>
  ({ key, label: key.toUpperCase(), fieldType, detectedType: 'text', isPrimary: false, width: 100 }) as ExcelColumn

const COLS = [col('sku'), col('name'), col('price'), col('total', 'formula')]

describe('rowCompleteness', () => {
  it('compte les champs remplis et liste les manquants (labels)', () => {
    const row: ExcelRow = { _id: 'r1', sku: 'A1', name: '', price: null }
    const c = rowCompleteness(row, COLS)
    expect(c.filled).toBe(1)
    expect(c.total).toBe(3) // la colonne formule est exclue
    expect(c.pct).toBe(33)
    expect(c.missing).toEqual(['NAME', 'PRICE'])
  })

  it('chaîne blanche / tableau vide = vide ; 0 et false = remplis', () => {
    const row: ExcelRow = { _id: 'r1', sku: '   ', name: 0, price: false }
    const c = rowCompleteness(row, COLS)
    expect(c.filled).toBe(2)
    expect(c.missing).toEqual(['SKU'])
  })

  it('100% si tout est rempli, 100 si aucune colonne évaluable', () => {
    const row: ExcelRow = { _id: 'r1', sku: 'A', name: 'B', price: 3 }
    expect(rowCompleteness(row, COLS).pct).toBe(100)
    expect(rowCompleteness(row, [col('f', 'formula')]).pct).toBe(100)
  })
})

describe('averageCompleteness', () => {
  it('moyenne arrondie des lignes', () => {
    const rows: ExcelRow[] = [
      { _id: 'a', sku: 'A', name: 'B', price: 1 }, // 100
      { _id: 'b', sku: 'A', name: null, price: null }, // 33
    ]
    expect(averageCompleteness(rows, COLS)).toBe(67)
  })
  it('100 si aucune ligne', () => {
    expect(averageCompleteness([], COLS)).toBe(100)
  })
})

describe('completenessTone', () => {
  it('seuils 90 / 60', () => {
    expect(completenessTone(95)).toBe('emerald')
    expect(completenessTone(90)).toBe('emerald')
    expect(completenessTone(75)).toBe('amber')
    expect(completenessTone(59)).toBe('red')
  })
})
