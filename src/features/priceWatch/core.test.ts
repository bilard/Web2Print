import { describe, it, expect } from 'vitest'
import { relationalKey, buildPatternUrl } from './core'
import type { TrackedProduct } from './types'

const base: TrackedProduct = { id: 'p1', name: 'Perceuse X', brand: 'Acme' }

describe('relationalKey', () => {
  it('préfère le SKU', () => {
    expect(relationalKey({ ...base, sku: 'SK1', ean: '123' })).toEqual({ kind: 'sku', value: 'SK1' })
  })
  it('replie sur EAN si pas de SKU', () => {
    expect(relationalKey({ ...base, ean: '123' })).toEqual({ kind: 'ean', value: '123' })
  })
  it('replie sur nom+marque si ni SKU ni EAN', () => {
    expect(relationalKey(base)).toEqual({ kind: 'name', value: 'Acme Perceuse X' })
  })
})

describe('buildPatternUrl', () => {
  it('substitue {sku}', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', { ...base, sku: 'SK1' })).toBe('https://s.com/p/SK1')
  })
  it('substitue {ean}', () => {
    expect(buildPatternUrl('https://s.com/p/{ean}', { ...base, ean: '3614220123456' }))
      .toBe('https://s.com/p/3614220123456')
  })
  it('rend null si l\'un des deux placeholders manque dans un pattern multi', () => {
    expect(buildPatternUrl('https://s.com/{sku}/{ean}', { ...base, sku: 'SK1' })).toBeNull()
  })
  it('rend null si placeholder manquant côté produit', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', base)).toBeNull()
  })
  it('encode {name}', () => {
    expect(buildPatternUrl('https://s.com/q?n={name}', base)).toBe('https://s.com/q?n=Perceuse%20X')
  })
  it('rend null si pas de pattern', () => {
    expect(buildPatternUrl(undefined, { ...base, sku: 'SK1' })).toBeNull()
  })
})
