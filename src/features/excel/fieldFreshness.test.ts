// src/features/excel/fieldFreshness.test.ts
import { describe, it, expect } from 'vitest'
import {
  FIELD_UPDATED_AT_KEY,
  cellFreshness,
  fieldAgeDays,
  freshnessTone,
  rowFieldTimestamps,
} from './fieldFreshness'
import type { ExcelRow } from './types'

const DAY = 86_400_000
const NOW = 1_780_000_000_000

describe('fieldAgeDays / freshnessTone', () => {
  it('calcule l’âge en jours entiers, jamais négatif', () => {
    expect(fieldAgeDays(NOW - 2.7 * DAY, NOW)).toBe(2)
    expect(fieldAgeDays(NOW + DAY, NOW)).toBe(0)
  })
  it('frais < 30 j, amber ≥ 30 j, red ≥ 90 j', () => {
    expect(freshnessTone(29)).toBeNull()
    expect(freshnessTone(30)).toBe('amber')
    expect(freshnessTone(89)).toBe('amber')
    expect(freshnessTone(90)).toBe('red')
  })
})

describe('cellFreshness', () => {
  const row = {
    _id: 'p1',
    name: 'Perceuse',
    price: '99',
    [FIELD_UPDATED_AT_KEY]: { name: NOW - 5 * DAY, price: NOW - 45 * DAY, desc: NOW - 200 * DAY },
  } as unknown as ExcelRow

  it('null pour un champ frais ou sans timestamp', () => {
    expect(cellFreshness(row, 'name', NOW)).toBeNull()
    expect(cellFreshness(row, 'brand', NOW)).toBeNull()
  })
  it('amber puis red selon l’âge', () => {
    expect(cellFreshness(row, 'price', NOW)).toEqual({ ageDays: 45, tone: 'amber' })
    expect(cellFreshness(row, 'desc', NOW)).toEqual({ ageDays: 200, tone: 'red' })
  })
  it('rangée sans map (_fieldUpdatedAt absent) = sheets Excel classiques → null partout', () => {
    const plain = { _id: 'x', name: 'a' } as unknown as ExcelRow
    expect(cellFreshness(plain, 'name', NOW)).toBeNull()
    expect(rowFieldTimestamps(plain)).toEqual({})
  })
})
