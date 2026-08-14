import { describe, it, expect } from 'vitest'
import { toFiniteNumber } from './numberValue'

describe('toFiniteNumber', () => {
  it('lit les nombres écrits à la française, avec ou sans unité', () => {
    expect(toFiniteNumber('1 299,90')).toBe(1299.9)
    expect(toFiniteNumber('1 299,90 €')).toBe(1299.9)
    expect(toFiniteNumber('12,5')).toBe(12.5)
    expect(toFiniteNumber('-3.5')).toBe(-3.5)
    expect(toFiniteNumber(42)).toBe(42)
  })

  it('rend null — jamais 0 — quand rien de numérique ne se lit', () => {
    expect(toFiniteNumber('')).toBeNull()
    expect(toFiniteNumber('   ')).toBeNull()
    expect(toFiniteNumber('Makita')).toBeNull()
    expect(toFiniteNumber(null)).toBeNull()
    expect(toFiniteNumber(undefined)).toBeNull()
    expect(toFiniteNumber(Number.NaN)).toBeNull()
  })
})
