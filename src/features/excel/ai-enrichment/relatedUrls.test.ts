import { describe, it, expect } from 'vitest'
import { normalizeUrl, discoverRelatedUrls } from './relatedUrls'

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

const grundfosHtml = `
<html><body>
  <header><nav><a href="/fr/categories">Catégories</a></nav></header>
  <div role="tablist">
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=overview">Vue d'ensemble</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variants">Variantes</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=specifications">Spécifications</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves">Courbes</a>
  </div>
  <footer><a href="/fr/legal">Mentions</a></footer>
</body></html>
`

describe('discoverRelatedUrls - tabs', () => {
  const base = new URL('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves')

  it('finds same-path tabs with different query strings', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=overview')
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variants')
    expect(tabs).toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=specifications')
  })

  it('excludes the base URL itself from tabs', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs).not.toContain('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?tab=variant-curves')
  })

  it('ignores nav/footer links even if same path', () => {
    const { tabs } = discoverRelatedUrls(grundfosHtml, base)
    expect(tabs.every(u => !u.includes('/legal'))).toBe(true)
    expect(tabs.every(u => !u.includes('/categories'))).toBe(true)
  })
})
