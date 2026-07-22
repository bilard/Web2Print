// src/features/priceWatch/catalog/genericCards.test.ts
import { describe, it, expect } from 'vitest'
import { parseListingDomCards } from './genericCards'

const BASE = 'https://www.shop.fr/fr/moteur/courroies/'

describe('parseListingDomCards', () => {
  it('extrait les cartes DOM génériques (nom/prix/url), ignore le bouton panier', () => {
    const html = `
      <div class="product-container">
        <a href="/panier?add=1&id_product=12">Ajouter au panier</a>
        <a class="product-name" href="/fr/12-courroie-a97.html" title="Courroie A97">Courroie A97</a>
        <img alt="Courroie A97" src="/img/a97.jpg">
        <span class="price">24,90 €</span> <span class="old-price">29,90 €</span>
        <span class="ref">Réf : A97</span>
      </div>
      <div class="product-container">
        <a href="/panier?add=1&id_product=13">Ajouter au panier</a>
        <a class="product-name" href="/fr/13-courroie-b45.html">Courroie B45</a>
        <span class="price">18,00 €</span>
      </div>`
    const cards = parseListingDomCards(html, BASE)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ name: 'Courroie A97', price: 24.9, listPrice: 29.9, ref: 'A97', url: 'https://www.shop.fr/fr/12-courroie-a97.html' })
    expect(cards[0].url).not.toContain('add=1')       // jamais le lien panier
    expect(cards[1].name).toBe('Courroie B45')
  })

  it('extrait via microdata schema.org/Product', () => {
    const html = `
      <li itemscope itemtype="https://schema.org/Product">
        <a href="/p/123-lame.html"><span itemprop="name">Lame 42cm</span></a>
        <meta itemprop="sku" content="LM42"><span itemprop="price" content="15.50">15,50 €</span>
      </li>
      <li itemscope itemtype="https://schema.org/Product">
        <a href="/p/124-lame.html" title="Lame 46cm">Lame 46cm</a>
        <span itemprop="price" content="17.90">17,90 €</span>
      </li>`
    const cards = parseListingDomCards(html, BASE)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ name: 'Lame 42cm', price: 15.5, ref: 'LM42' })
  })

  it('garde-fou : [] si moins de 2 produits complets (pas de garbage)', () => {
    // Une seule carte valide → rejet (une liste en a plusieurs).
    expect(parseListingDomCards(`<div class="product"><a href="/p/1.html">X</a><span class="price">9,90 €</span></div>`, BASE)).toEqual([])
  })

  it('garde-fou : [] si les blocs n\'ont pas de prix (page non-liste / techno non couverte)', () => {
    const html = `<div class="product"><a href="/p/1.html">Article 1</a></div><div class="product"><a href="/p/2.html">Article 2</a></div>`
    expect(parseListingDomCards(html, BASE)).toEqual([])
  })

  it('détecte HT / TTC dans le texte (stats alignées)', () => {
    const ht = `
      <div class="product"><a class="product-name" href="/p/1.html">Courroie A97</a><span class="regular-price">9,33 € HT</span></div>
      <div class="product"><a class="product-name" href="/p/2.html">Courroie B45</a><span class="regular-price">11,67 € HT</span></div>`
    expect(parseListingDomCards(ht, BASE).every((c) => c.taxIncluded === false)).toBe(true)
    const ttc = ht.replace(/HT/g, 'TTC')
    expect(parseListingDomCards(ttc, BASE).every((c) => c.taxIncluded === true)).toBe(true)
  })

  it('garde-fou : rejette « Ajouter au panier » comme nom', () => {
    const html = `
      <div class="product"><a href="/fr/1-x.html">Ajouter au panier</a><span class="price">9,90 €</span></div>
      <div class="product"><a href="/fr/2-y.html">Ajouter au panier</a><span class="price">8,90 €</span></div>`
    // noms = boutons → aucun nom valide → items rejetés → []
    expect(parseListingDomCards(html, BASE)).toEqual([])
  })
})
