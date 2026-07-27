import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('microdata Product à DOM profondément imbriqué (190cc.fr)', () => {
  // Markup RÉEL (condensé) relevé le 2026-07-23 : chaque carte est un bloc
  // itemscope Product contenant PLUSIEURS <div> imbriqués — l'appariement de balise
  // fermante non-greedy s'arrêtait au premier </div> et tronquait la carte (0 produit
  // sur 48). Le prix est un <meta itemprop="price">, la réf un label HTML-ENCODÉ
  // (« R&eacute;f. 07-17-703-25 »).
  const card = (id: number, ref: string, price: string, name: string, slug: string) => `
    <div itemscope itemtype="http://schema.org/Product" class="product-content">
      <div class="product-ctn cc19-row" data-id-product="${id}">
        <div class="product-img-ctn cc19-sm3">
          <div class="product-tag"><p><span>Pi&egrave;ce d&rsquo;origine garantie</span></p></div>
          <img class="img-responsive" itemprop="image" src="https://www.190cc.fr/${id}-home_default/x.jpg" alt="${name}" />
        </div>
        <div class="product-infos cc19-sm6">
          <h3 itemprop="name" class="product-name">
            <a class="referal" href="https://www.190cc.fr/fr/${slug}.html" title="${name}">${name}</a>
          </h3>
          <p class="product-ref">R&eacute;f. ${ref}</p>
          <div class="cc19-flex">
            <div itemprop="offers" itemscope itemtype="http://schema.org/Offer" class="product-price">
              <meta itemprop="price" content="${price}" />
              <span class="price">${price.replace('.', ',')} &euro;</span>
            </div>
          </div>
        </div>
      </div>
    </div>`
  const page = `<div class="products-list product-anchor">
    ${card(331, '07-17-703-25', '8.4', 'Filtre air Briggs Stratton Quantum', 'filtre-air-briggs-stratton-quantum')}
    ${card(332, '07-17-704-26', '12.9', 'Filtre air Honda GCV160', 'filtre-air-honda-gcv160')}
  </div>`

  it('extrait les cartes malgré l’imbrication (nom + prix microdata + URL)', () => {
    const out = parseListingDomCards(page, 'https://www.190cc.fr/fr/moteur/filtre-moteur/filtre-a-air/')
    expect(out).toHaveLength(2)
    expect(out[0].name).toContain('Briggs')
    expect(out[0].price).toBe(8.4)
    expect(out[0].url).toBe('https://www.190cc.fr/fr/filtre-air-briggs-stratton-quantum.html')
  })

  it('lit la réf malgré le label HTML-encodé « R&eacute;f. »', () => {
    const out = parseListingDomCards(page, 'https://www.190cc.fr/')
    expect(out[0].ref).toBe('07-17-703-25')
    expect(out[1].ref).toBe('07-17-704-26')
  })
})

describe('payload produit dans un attribut data-* (plateforme maison)', () => {
  // Markup RÉEL (extrait, blocs « compatibilité » élagués) relevé le 2026-07-27 sur
  // https://swap-europe.com/fr/jardinage/tondeuse : aucune classe « product » (les cartes
  // s'appellent `piecePlug`), aucune microdata — mais chaque bouton d'ajout au panier porte
  // le produit complet en JSON dans `data-piece`. Les trois paliers rendaient 0.
  const html = readFileSync(join(__dirname, '__fixtures__', 'listing-swap-europe.html'), 'utf-8')
  const CAT = 'https://www.swap-europe.com/fr/jardinage/tondeuse'

  it('extrait les cartes d’une plateforme sans classe « product » ni microdata', () => {
    const out = parseListingDomCards(html, CAT)
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({
      ref: '20282735',
      url: 'https://swap-europe.com/fr/tronconneuse-souffleur/poire-d-amorcage-22-2mm-/20282735',
    })
    expect(out[0].name).toContain('Poire')
  })

  it('retient le prix AFFICHÉ (TTC) et non le prix du payload (HT)', () => {
    const out = parseListingDomCards(html, CAT)
    // data-piece porte price=2.05 (HT) ; la grille affiche « 2,46 € TTC ».
    expect(out[0].price).toBe(2.46)
    expect(out[0].taxIncluded).toBe(true)
  })

  it('survit à un attribut cassé par une apostrophe dans le nom', () => {
    // `data-piece='{"name":"Poire d'amorçage…'` : l'attribut se ferme au milieu du JSON.
    // Le découpage par imbrication d'accolades doit quand même rendre l'objet complet.
    expect(parseListingDomCards(html, CAT)[0].name).toContain("d'amor")
  })

  it('garde-fou : un data-* sans nom/prix/URL n’est pas un produit', () => {
    // `data-settings='{"preventScroll": true}'` est présent 3 fois dans la fixture.
    const only = `<div data-settings='{"preventScroll": true}'></div>
      <div data-cfg='{"a":1}'></div>`
    expect(parseListingDomCards(only, CAT)).toEqual([])
  })
})
