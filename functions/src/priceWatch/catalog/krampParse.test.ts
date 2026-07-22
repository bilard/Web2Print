import { describe, it, expect } from 'vitest'
import { krampRefFromUrl, parseFrPrice, parseKrampSearchUrls, parseKrampSearchListing } from './krampParse'

const P = 'https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801'
// Markdown représentatif d'une page de RECHERCHE kramp connectée (structure observée live) :
// image + marque + réf nue + nom descriptif pointent tous vers la fiche ; puis le prix HT.
const SEARCH_MD = `## 1 résultat de recherche pour 092.48.801
[![](https://images.kramp.com/x.jpg)](${P})
[MTD](${P})
[09248801](${P})
[Courroie trapézoïdale](${P})
[Courroie trapézoïdale vue d'ensemble](https://www.kramp.com/shop-fr/fr/vp/x--ticItemGroup-47670448)
Afficher le stock
12,06 €`

describe('krampParse', () => {
  it('krampRefFromUrl : réf = segment après « -- »', () => {
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801')).toBe('09248801')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/r%C3%A9servoir--1134381601')).toBe('1134381601')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/produit--foo--12345')).toBe('12345') // slug à double « -- » → dernier segment
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801?utm=a#frag')).toBe('09248801') // query/hash ignorés
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/no-ref')).toBe('')
  })
  it('parseFrPrice : nombre français → number', () => {
    expect(parseFrPrice('1 234,56 €')).toBe(1234.56)
    expect(parseFrPrice('93,57')).toBe(93.57)
    expect(parseFrPrice('gratuit')).toBeNull()
  })
  it('parseKrampSearchUrls : URLs fiches /p/…--ref du markdown (pas les /vp/)', () => {
    expect(parseKrampSearchUrls(SEARCH_MD)).toEqual([P])
    expect(parseKrampSearchUrls('aucun résultat')).toEqual([])
  })
  it('parseKrampSearchListing : URL + réf + nom + prix HT depuis la page de recherche', () => {
    const l = parseKrampSearchListing(SEARCH_MD)
    expect(l).not.toBeNull()
    expect(l!.url).toBe(P)
    expect(l!.ref).toBe('09248801')
    expect(l!.price).toBe(12.06)
    expect(l!.taxIncluded).toBe(false)
    expect(l!.currency).toBe('EUR')
    expect(l!.name).toBe('Courroie trapézoïdale') // le libellé descriptif, pas la marque « MTD » ni la réf nue ni l'image
  })
  it('parseKrampSearchListing : null si aucun résultat / aucun prix', () => {
    expect(parseKrampSearchListing('Aucune correspondance exacte trouvée')).toBeNull()
    expect(parseKrampSearchListing(`[Produit sans prix](${P})`)).toBeNull()
  })
})
