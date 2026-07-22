import { describe, it, expect } from 'vitest'
import { krampRefFromUrl, parseFrPrice, parseKrampSearchUrls, parseKrampProduct } from './krampParse'

// Markdown représentatif d'une page de RECHERCHE kramp connectée (structure observée live).
const SEARCH_MD = `### Résultats de recherche
[Courroie trapézoïdale](https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801)
Prix brut 12,06 €`

// Markdown représentatif d'une FICHE produit kramp connectée (structure observée live).
const PRODUCT_MD = `## Réservoir d'huile hydro stiga villa
- 1150 HST
- Adaptable sur Villa
Plus de détails
#### Prix brut
## 93,57 €
`

describe('krampParse', () => {
  it('krampRefFromUrl : réf = segment après « -- »', () => {
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801')).toBe('09248801')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/r%C3%A9servoir--1134381601')).toBe('1134381601')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/no-ref')).toBe('')
  })
  it('parseFrPrice : nombre français → number', () => {
    expect(parseFrPrice('1 234,56 €')).toBe(1234.56)
    expect(parseFrPrice('93,57')).toBe(93.57)
    expect(parseFrPrice('gratuit')).toBeNull()
  })
  it('parseKrampSearchUrls : URLs fiches /p/…--ref du markdown', () => {
    expect(parseKrampSearchUrls(SEARCH_MD)).toEqual([
      'https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801',
    ])
    expect(parseKrampSearchUrls('aucun résultat')).toEqual([])
  })
  it('parseKrampProduct : prix « Prix brut » (HT), réf, nom', () => {
    const l = parseKrampProduct(PRODUCT_MD, 'https://www.kramp.com/shop-fr/fr/p/reservoir--1134381601')
    expect(l).not.toBeNull()
    expect(l!.ref).toBe('1134381601')
    expect(l!.price).toBe(93.57)
    expect(l!.taxIncluded).toBe(false)
    expect(l!.currency).toBe('EUR')
    expect(l!.name.toLowerCase()).toContain('stiga')
  })
  it('parseKrampProduct : null si pas de prix', () => {
    expect(parseKrampProduct('## Produit sans prix', 'https://www.kramp.com/shop-fr/fr/p/x--1')).toBeNull()
  })
})
