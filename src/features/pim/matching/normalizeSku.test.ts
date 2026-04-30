import { describe, it, expect } from 'vitest'
import { normalizeSku } from './normalizeSku'

describe('normalizeSku', () => {
  it('canonicalise des variantes du même SKU', () => {
    expect(normalizeSku({ sku: 'MIL-4933478577' })).toBe('mil4933478577')
    expect(normalizeSku({ sku: 'mil 4933478577' })).toBe('mil4933478577')
    expect(normalizeSku({ sku: '  4933478577 ' })).toBe('4933478577')
  })

  it('renvoie null pour absence/empty', () => {
    expect(normalizeSku({})).toBeNull()
    expect(normalizeSku({ sku: '' })).toBeNull()
    expect(normalizeSku({ sku: '   ' })).toBeNull()
    expect(normalizeSku({ sku: null as unknown as string })).toBeNull()
  })

  it('priorise EAN sur SKU si les deux présents', () => {
    expect(normalizeSku({ sku: 'X1', ean: '4002395123456' })).toBe('4002395123456')
  })

  it('reconnaît gtin et ref comme fallbacks', () => {
    expect(normalizeSku({ gtin: '4002395999111' })).toBe('4002395999111')
    expect(normalizeSku({ ref: 'REF-A12' })).toBe('refa12')
  })

  it('garde uniquement alphanumérique en lowercase', () => {
    expect(normalizeSku({ sku: 'A.B/C-D_E' })).toBe('abcde')
    expect(normalizeSku({ sku: 'éàç-123' })).toBe('123')  // accents éliminés
  })
})
