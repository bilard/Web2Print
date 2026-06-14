import { describe, it, expect } from 'vitest'
import { relationalKey, buildPatternUrl, discoveryQueries, pickCandidate, evaluate } from './priceWatchTrack'

describe('serveur — logique veille tarifaire (wire-compatible client)', () => {
  it('relationalKey SKU→EAN→nom', () => {
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', sku: 'S' }).kind).toBe('sku')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', ean: 'E' }).kind).toBe('ean')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A' }).value).toBe('A X')
  })
  it('buildPatternUrl substitue/encode', () => {
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X', sku: 'S1' })).toBe('https://s.com/S1')
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X' })).toBeNull()
  })
  it('discoveryQueries scope domaine', () => {
    expect(discoveryQueries('e.com', { id: 'p', name: 'X', brand: 'A', sku: 'S' })[0]).toBe('site:e.com S')
  })
  it('pickCandidate garde le domaine', () => {
    expect(pickCandidate([{ url: 'https://e.com/x' }], 'e.com')).toBe('https://e.com/x')
  })
  it('evaluate positionnement + variation', () => {
    expect(evaluate({ id: 'p', name: 'X', myPrice: 100 }, { id: 's', domain: 'e.com' }, 90, undefined, 0)
      .some((a) => a.kind === 'positioning')).toBe(true)
    expect(evaluate({ id: 'p', name: 'X' }, { id: 's', domain: 'e.com' }, 120, 100, 10)
      .some((a) => a.kind === 'competitor-variation')).toBe(true)
  })
})
