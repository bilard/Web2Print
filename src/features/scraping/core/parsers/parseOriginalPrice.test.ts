import { describe, it, expect } from 'vitest'
import { parseOriginalPriceFromHtml } from './parseOriginalPrice'

describe('parseOriginalPriceFromHtml', () => {
  it('balise <del>', () => {
    const html = '<span class="price">549 €</span> <del>649,99 €</del>'
    expect(parseOriginalPriceFromHtml(html, 549)).toBe(649.99)
  })

  it('balise <s> avec markup imbriqué', () => {
    const html = '<s class="x"><span>1 299 €</span></s>'
    expect(parseOriginalPriceFromHtml(html, 999)).toBe(1299)
  })

  it('classe-indice (price--old, prix-barre…)', () => {
    expect(parseOriginalPriceFromHtml('<span class="product-price--old">89,90 €</span>', 69.9)).toBe(89.9)
    expect(parseOriginalPriceFromHtml('<div class="prix-barre">€ 120</div>', 99)).toBe(120)
  })

  it('rejette un barré ≤ prix de vente (faux positif)', () => {
    expect(parseOriginalPriceFromHtml('<del>5,99 €</del>', 549)).toBeNull()
  })

  it('null sans prix barré', () => {
    expect(parseOriginalPriceFromHtml('<span class="price">549 €</span>', 549)).toBeNull()
  })
})
