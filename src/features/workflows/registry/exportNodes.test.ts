// src/features/workflows/registry/exportNodes.test.ts
// Formats de cellule à l'export .xlsx : EAN entier, prix 2 décimales, % … (cf. demande
// « typer les champs dans le bon format Excel »).
import { describe, it, expect } from 'vitest'
import { numberFormatFor, coerceNumeric } from './exportNodes'

describe('numberFormatFor', () => {
  it('EAN (code-barres) → entier sans décimale', () => {
    expect(numberFormatFor({ key: 'ean', fieldType: 'barcode', decimals: 0 })).toBe('0')
  })
  it('prix (nombre 2 décimales) → 0.00', () => {
    expect(numberFormatFor({ key: 'p', fieldType: 'number', decimals: 2 })).toBe('0.00')
  })
  it('écart → format pourcentage NATIF Excel (0.0%)', () => {
    expect(numberFormatFor({ key: 'e', fieldType: 'percent', decimals: 1 })).toBe('0.0%')
  })
  it('monétaire → séparateur milliers + €', () => {
    expect(numberFormatFor({ key: 'm', fieldType: 'currency', decimals: 2 })).toBe('#,##0.00 €')
  })
  it('texte → aucun format', () => {
    expect(numberFormatFor({ key: 't', fieldType: 'text' })).toBeUndefined()
  })
  it('nombre sans décimales déclarées → format Général (rétro-compat)', () => {
    expect(numberFormatFor({ key: 'n', fieldType: 'number' })).toBeUndefined()
  })
  it('colonne sans métadonnée → aucun format', () => {
    expect(numberFormatFor({ key: 'x' })).toBeUndefined()
  })
})

describe('coerceNumeric', () => {
  it('convertit une chaîne numérique (EAN)', () => {
    expect(coerceNumeric('3582321864143')).toBe(3582321864143)
  })
  it('accepte la virgule décimale', () => {
    expect(coerceNumeric('11,22')).toBe(11.22)
  })
  it('laisse un nombre tel quel', () => {
    expect(coerceNumeric(11.22)).toBe(11.22)
  })
  it('vide → null (cellule vide, pas 0 trompeur)', () => {
    expect(coerceNumeric('')).toBeNull()
    expect(coerceNumeric(null)).toBeNull()
  })
  it('non-numérique → conservé tel quel', () => {
    expect(coerceNumeric('En stock')).toBe('En stock')
  })
})
