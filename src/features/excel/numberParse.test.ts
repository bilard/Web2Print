// src/features/excel/numberParse.test.ts
import { describe, it, expect } from 'vitest'
import { parseCellNumber } from './numberParse'

describe('parseCellNumber', () => {
  it('nombres natifs et null', () => {
    expect(parseCellNumber(24.9)).toBe(24.9)
    expect(parseCellNumber(null)).toBe(null)
    expect(parseCellNumber(true)).toBe(null)
    expect(parseCellNumber('')).toBe(null)
    expect(parseCellNumber('abc')).toBe(null)
  })
  it('point décimal EN — le bug « 24.90 » → 2490 est corrigé', () => {
    expect(parseCellNumber('24.90')).toBe(24.9)
    expect(parseCellNumber('199.90')).toBe(199.9)
    expect(parseCellNumber('0.5')).toBe(0.5)
  })
  it('virgule décimale FR', () => {
    expect(parseCellNumber('24,90')).toBe(24.9)
    expect(parseCellNumber('1 199,00')).toBe(1199)
    expect(parseCellNumber('1 199,00')).toBe(1199) // espace insécable
  })
  it('formats mixtes milliers + décimale', () => {
    expect(parseCellNumber('1,199.00')).toBe(1199) // EN
    expect(parseCellNumber('1.199,00')).toBe(1199) // FR
  })
  it('séparateur répété seul = milliers', () => {
    expect(parseCellNumber('1.234.567')).toBe(1234567)
    expect(parseCellNumber('1,234,567')).toBe(1234567)
  })
  it('symboles monétaires et pourcent', () => {
    expect(parseCellNumber('24,90 €')).toBe(24.9)
    expect(parseCellNumber('$1,199.00')).toBe(1199)
    expect(parseCellNumber('15%')).toBe(15)
  })
  it('négatifs et entiers', () => {
    expect(parseCellNumber('-24.90')).toBe(-24.9)
    expect(parseCellNumber('1199')).toBe(1199)
  })
})
