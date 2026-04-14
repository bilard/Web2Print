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

const htmlWithPdfs = `
<html><body>
  <main>
    <a href="/docs/datasheet-alpha1.pdf">Datasheet</a>
    <a href="/docs/manual-fr.pdf?v=2">Manuel</a>
    <a href="https://cdn.grundfos.com/api/binary/d123.pdf">Certificat</a>
  </main>
</body></html>
`

describe('discoverRelatedUrls - pdfs', () => {
  const base = new URL('https://www.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186')

  it('collects internal pdf links with anchor name preserved (nom##url)', () => {
    const { pdfs } = discoverRelatedUrls(htmlWithPdfs, base)
    expect(pdfs.some(p => p === 'Datasheet##https://www.grundfos.com/docs/datasheet-alpha1.pdf')).toBe(true)
    expect(pdfs.some(p => p.startsWith('Manuel##') && p.includes('manual-fr.pdf'))).toBe(true)
  })

  it('collects external pdf links from CDNs with anchor name', () => {
    const { pdfs } = discoverRelatedUrls(htmlWithPdfs, base)
    expect(pdfs.some(p => p === 'Certificat##https://cdn.grundfos.com/api/binary/d123.pdf')).toBe(true)
  })
})

const htmlWithSubpages = `
<html><body>
  <main>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-180-93074187">Alpha1 GO 25-40 180</a>
    <a href="/fr/products/scala">Scala</a>
    <a href="/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186/specifications">Specs</a>
  </main>
</body></html>
`

describe('discoverRelatedUrls - subpages', () => {
  const base = new URL('https://www.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186')

  it('collects sibling pages at same depth', () => {
    const { subpages } = discoverRelatedUrls(htmlWithSubpages, base)
    expect(subpages.some(u => u.endsWith('/alpha1-go-25-40-180-93074187'))).toBe(true)
  })

  it('ignores pages outside the product slug root', () => {
    const { subpages } = discoverRelatedUrls(htmlWithSubpages, base)
    expect(subpages.every(u => !u.endsWith('/scala'))).toBe(true)
  })
})

const grundfosButtonHtml = `
<html><body>
  <main>
    <div class="cmp-tabs__list-item">
      <button data-qa="cmp-tab-variant-overview" aria-controls="variant-overview" type="button" role="tab" class="elm-tab-button">Vue d'ensemble</button>
    </div>
    <div class="cmp-tabs__list-item">
      <button data-qa="cmp-tab-variants" aria-controls="variants" type="button" role="tab" class="elm-tab-button">Variantes</button>
    </div>
    <div class="cmp-tabs__list-item">
      <button data-qa="cmp-tab-specifications" aria-controls="specifications" type="button" role="tab" class="elm-tab-button">Spécifications</button>
    </div>
    <div class="cmp-tabs__list-item">
      <button data-qa="cmp-tab-variant-curves" aria-controls="variant-curves" type="button" role="tab" aria-selected="true" class="elm-tab-button">Courbes</button>
    </div>
    <div class="cmp-tabs__list-item">
      <button data-qa="cmp-tab-documents" aria-controls="documents" type="button" role="tab" class="elm-tab-button">Documentations</button>
    </div>
  </main>
</body></html>
`

describe('discoverRelatedUrls - ARIA tabs synthesis', () => {
  const baseWithTab = new URL('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186?pumpsystemid=28&tab=variant-curves')

  it('synthesizes tab URLs from role="tab" buttons when baseUrl has tab query key', () => {
    const { tabs } = discoverRelatedUrls(grundfosButtonHtml, baseWithTab)
    // Must produce URLs for each non-current tab
    expect(tabs.some(u => u.includes('tab=variant-overview'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=variants'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=specifications'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=documents'))).toBe(true)
  })

  it('excludes the current tab (aria-selected or equal to baseUrl value)', () => {
    const { tabs } = discoverRelatedUrls(grundfosButtonHtml, baseWithTab)
    expect(tabs.every(u => !u.endsWith('tab=variant-curves'))).toBe(true)
  })

  it('preserves other query params (e.g. pumpsystemid) when synthesizing', () => {
    const { tabs } = discoverRelatedUrls(grundfosButtonHtml, baseWithTab)
    // Expect pumpsystemid to be carried over
    expect(tabs.every(u => u.includes('pumpsystemid=28'))).toBe(true)
  })

  it('synthesizes tabs with default "tab" key when baseUrl has no tab-like query key', () => {
    const baseNoTab = new URL('https://product-selection.grundfos.com/fr/products/alpha/alpha1-go/alpha1-go-25-40-130-93074186')
    const { tabs } = discoverRelatedUrls(grundfosButtonHtml, baseNoTab)
    // DOM has role="tab" buttons → infer 'tab' as default key and synthesize URLs
    expect(tabs.some(u => u.includes('tab=variant-overview'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=variants'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=specifications'))).toBe(true)
    expect(tabs.some(u => u.includes('tab=documents'))).toBe(true)
    // aria-selected=true tab (variant-curves) is still the selected one → skipped
    expect(tabs.every(u => !u.endsWith('tab=variant-curves'))).toBe(true)
  })

  it('strips common prefixes from data-qa (cmp-tab-, tab-)', () => {
    const html = `<button role="tab" data-qa="cmp-tab-specifications" aria-controls="spec-panel">Specs</button>`
    const base = new URL('https://x.com/p?tab=overview')
    const { tabs } = discoverRelatedUrls(html, base)
    // aria-controls preferred over data-qa, so we expect tab=spec-panel OR tab=specifications
    // Check that prefix 'cmp-tab-' is NOT in the synthesized URL
    expect(tabs.every(u => !u.includes('cmp-tab-'))).toBe(true)
    expect(tabs.length).toBeGreaterThan(0)
  })
})
