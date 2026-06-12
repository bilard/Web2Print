import { describe, it, expect } from 'vitest'
import { parsePromoPricing } from './parseOriginalPrice'

describe('parsePromoPricing', () => {
  it('cas nominal : JSON-LD = prix promo, barré supérieur dans le markup', () => {
    const html = '<span class="price">549 €</span> <del>649,99 €</del>'
    expect(parsePromoPricing(html, 549)).toEqual({ selling: 549, original: 649.99 })
  })

  it('balise <s> avec markup imbriqué', () => {
    const html = '<s class="x"><span>1 299 €</span></s>'
    expect(parsePromoPricing(html, 999)).toEqual({ selling: 999, original: 1299 })
  })

  it('classe-indice (price--old, prix-barre…)', () => {
    expect(parsePromoPricing('<span class="product-price--old">89,90 €</span>', 69.9))
      .toEqual({ selling: 69.9, original: 89.9 })
  })

  it('JSON-LD = prix barré + badge remise (cas Jardiland) → vente corrigée', () => {
    const html = '<del>74,72 €</del> <span class="discount-badge">-24,50 €</span> <span class="current">50,22 €</span>'
    expect(parsePromoPricing(html, 74.72)).toEqual({ selling: 50.22, original: 74.72 })
  })

  it('JSON-LD = prix barré + prix inférieur à proximité (sans badge) → vente corrigée', () => {
    const html = '<del>74,72 €</del> <span class="current">50,22 €</span>'
    expect(parsePromoPricing(html, 74.72)).toEqual({ selling: 50.22, original: 74.72 })
  })

  it('barré ≈ JSON-LD sans prix promo trouvable → JSON-LD conservé sans barré', () => {
    expect(parsePromoPricing('<del>74,72 €</del>', 74.72)).toEqual({ selling: 74.72 })
  })

  it('barré < JSON-LD = faux positif (prix au litre…) → ignoré', () => {
    expect(parsePromoPricing('<del>5,99 €</del>', 549)).toEqual({ selling: 549 })
  })

  it('sans barré → JSON-LD tel quel', () => {
    expect(parsePromoPricing('<span class="price">549 €</span>', 549)).toEqual({ selling: 549 })
  })

  it('markup Jardiland réel : --bold (prix de vente) ne doit PAS matcher « old »', () => {
    // Classes exactes du design system Jardiland (ds-ens-pricing) : le prix payé
    // est en --bold AVANT le barré --crossed dans le DOM → sans \b, « old »
    // matchait « bold » et la promo était perdue.
    const html =
      '<span class="ds-ens-pricing__price-amount ds-ens-pricing__price-amount--xxxl ds-ens-pricing__price-amount--bold">50,22 €</span>' +
      '<span class="ds-ens-pricing__discount-text ds-ens-pricing__discount-text--crossed">74,72 €</span>' +
      '<span class="ds-ens-pricing__discount-badge">-24,50 €</span>'
    expect(parsePromoPricing(html, 74.72)).toEqual({ selling: 50.22, original: 74.72 })
  })

  it('markup Jardiland sans promo : prix --bold seul → pas de barré', () => {
    const html = '<span class="ds-ens-pricing__price-amount ds-ens-pricing__price-amount--bold">37,76 €</span>'
    expect(parsePromoPricing(html, 37.76)).toEqual({ selling: 37.76 })
  })
})
