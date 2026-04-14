import { describe, it, expect } from 'vitest'
import { normalizeUrl } from './relatedUrls'

describe('normalizeUrl', () => {
  it('lowercases host and trims trailing slash', () => {
    expect(normalizeUrl('https://Example.COM/foo/')).toBe('https://example.com/foo')
  })
  it('sorts query params deterministically', () => {
    expect(normalizeUrl('https://a.com/p?b=2&a=1')).toBe('https://a.com/p?a=1&b=2')
  })
  it('drops tracking params (utm_*, gclid, fbclid)', () => {
    expect(normalizeUrl('https://a.com/p?utm_source=x&id=7&gclid=yyy')).toBe('https://a.com/p?id=7')
  })
  it('drops fragments', () => {
    expect(normalizeUrl('https://a.com/p#section-2')).toBe('https://a.com/p')
  })
  it('keeps fragments if keepHash=true', () => {
    expect(normalizeUrl('https://a.com/p#tab=variants', { keepHash: true })).toBe('https://a.com/p#tab=variants')
  })
  it('returns null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull()
  })
})
