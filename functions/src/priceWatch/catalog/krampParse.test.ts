import { describe, it, expect } from 'vitest'
import { krampRefFromUrl, parseFrPrice, parseKrampSearchUrls, parseKrampSearchCards } from './krampParse'

const P1 = 'https://www.kramp.com/shop-fr/fr/p/courroie-trapezoidale--09248801'
const P2 = 'https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601'

describe('krampParse', () => {
  it('krampRefFromUrl : réf = segment après le DERNIER « -- »', () => {
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801')).toBe('09248801')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/produit--foo--12345')).toBe('12345')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/p/x--09248801?utm=a#frag')).toBe('09248801')
    expect(krampRefFromUrl('https://www.kramp.com/shop-fr/fr/no-ref')).toBe('')
  })
  it('parseFrPrice : nombre français → number', () => {
    expect(parseFrPrice('1 234,56 €')).toBe(1234.56)
    expect(parseFrPrice('93,57')).toBe(93.57)
    expect(parseFrPrice('gratuit')).toBeNull()
  })
  it('parseKrampSearchUrls : URLs fiches /p/…--ref (pas les /vp/)', () => {
    expect(parseKrampSearchUrls(`[x](${P1})\n[vue](https://www.kramp.com/shop-fr/fr/vp/x--tic-1)`)).toEqual([P1])
    expect(parseKrampSearchUrls('aucun résultat')).toEqual([])
  })

  it('parseKrampSearchCards : carte simple → URL + réf + nom + prix HT', () => {
    const md = `## 1 résultat de recherche
[![](https://images.kramp.com/x.jpg)](${P1})
[MTD](${P1})
[09248801](${P1})
[Courroie trapézoïdale](${P1})
Afficher le stock
12,06 €`
    const cards = parseKrampSearchCards(md)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ url: P1, ref: '09248801', name: 'Courroie trapézoïdale', price: 12.06 })
  })

  it('parseKrampSearchCards : un € de BANDEAU avant la fiche N’EST PAS rattaché (zéro faux prix)', () => {
    const md = `Livraison gratuite dès 50,00 €
Filtrer à partir de 5,00 €
## 1 résultat
[Courroie trapézoïdale](${P1})
12,06 €`
    const cards = parseKrampSearchCards(md)
    expect(cards).toHaveLength(1)
    expect(cards[0].price).toBe(12.06) // pas 50,00 ni 5,00 (hors fenêtre de la carte)
  })

  it('parseKrampSearchCards : multi-résultats → chaque carte a SON prix', () => {
    const md = `## 2 résultats
[Courroie trapézoïdale](${P1})
12,06 €
[Réservoir hydro stiga](${P2})
93,57 €`
    const cards = parseKrampSearchCards(md)
    expect(cards).toHaveLength(2)
    expect(cards.find((c) => c.ref === '09248801')!.price).toBe(12.06)
    expect(cards.find((c) => c.ref === '1134381601')!.price).toBe(93.57)
  })

  it('parseKrampSearchCards : réf pointée collée au prix → prix non corrompu', () => {
    const md = `[Courroie](${P1})\n092.48.801 12,06 €`
    expect(parseKrampSearchCards(md)[0].price).toBe(12.06)
  })

  it('parseKrampSearchCards : carte sans prix → écartée', () => {
    expect(parseKrampSearchCards(`[Produit](${P1})\nStock épuisé`)).toEqual([])
    expect(parseKrampSearchCards('Aucune correspondance exacte')).toEqual([])
  })
})
