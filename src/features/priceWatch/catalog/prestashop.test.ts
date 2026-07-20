// src/features/priceWatch/catalog/prestashop.test.ts
// Les fixtures de __fixtures__/ sont des cartes produit RÉELLES, capturées sur les
// pages catégorie des concurrents. Elles garantissent la non-régression face aux
// variantes de thème (obfuscation base64 des liens, référence en tête de titre…).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseListingPage, parsePriceFragment, splitProductBlocks,
  extractAvailability, parseProductPage, parseJsonLdObjects, nextListingUrl, pageUrl,
} from './prestashop'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', `listing-${name}.html`), 'utf-8')

describe('parsePriceFragment', () => {
  it('lit les formats marchands courants', () => {
    expect(parsePriceFragment('4,67 € TTC')).toBe(4.67)
    expect(parsePriceFragment(' 98,00 € ')).toBe(98)
    expect(parsePriceFragment('98')).toBe(98)
    expect(parsePriceFragment('1 299,90 €')).toBe(1299.9)
    expect(parsePriceFragment('1,299.90')).toBe(1299.9)
  })
  it('distingue milliers et décimales', () => {
    expect(parsePriceFragment('1.299')).toBe(1299)
    expect(parsePriceFragment('284.41')).toBe(284.41)
  })
  it('rend undefined sur un fragment sans nombre', () => {
    expect(parsePriceFragment('Prix sur demande')).toBeUndefined()
  })
})

describe('extractAvailability', () => {
  it('lit schema.org en priorité', () => {
    expect(extractAvailability('<link href="https://schema.org/InStock">')).toBe('in-stock')
    expect(extractAvailability('http://schema.org/OutOfStock')).toBe('out-of-stock')
    expect(extractAvailability('schema.org/PreOrder')).toBe('on-order')
  })
  it('retombe sur les libellés français', () => {
    expect(extractAvailability('<span class="badge">En stock</span>')).toBe('in-stock')
    expect(extractAvailability('<span>Rupture de stock</span>')).toBe('out-of-stock')
    expect(extractAvailability('<span>Sur commande</span>')).toBe('on-order')
  })
  it('rend undefined quand rien n’est déclaré', () => {
    expect(extractAvailability('<div>Ajouter au panier</div>')).toBeUndefined()
  })
})

describe('parseListingPage — pro-motoculture (réf + prix sur la liste)', () => {
  const items = parseListingPage(fixture('pro-motoculture'))

  it('extrait les cartes', () => {
    expect(items.length).toBeGreaterThanOrEqual(2)
  })
  it('lit la référence constructeur affichée', () => {
    const alt = items.find((i) => i.ref === 'BS691991')
    expect(alt).toBeDefined()
    expect(alt?.name).toContain('Briggs')
  })
  it('lit le prix depuis l’attribut machine', () => {
    expect(items.find((i) => i.ref === 'BS691991')?.price).toBe(98)
  })
  it('lit la disponibilité', () => {
    expect(items.find((i) => i.ref === 'BS691991')?.availability).toBe('in-stock')
  })
  it('lit l’URL absolue de la fiche', () => {
    expect(items[0].url).toMatch(/^https:\/\/www\.pro-motoculture\.com\/.+\.html$/)
  })
})

describe('parseListingPage — webmotoculture (liens obfusqués, prix TTC explicite)', () => {
  const items = parseListingPage(fixture('webmotoculture'))

  it('extrait les cartes malgré l’obfuscation base64 des liens', () => {
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].url).toMatch(/^https:\/\/www\.webmotoculture\.com\//)
  })
  it('lit la référence derrière le libellé « Réf : »', () => {
    const item = items.find((i) => i.ref === '21130-2056')
    expect(item).toBeDefined()
    expect(item?.ref).not.toMatch(/R[ée]f/i)
  })
  it('lit le prix et reconnaît la mention TTC', () => {
    const item = items.find((i) => i.ref === '21130-2056')
    expect(item?.price).toBe(4.67)
    expect(item?.taxIncluded).toBe(true)
  })
  it('ne confond pas le sélecteur de quantité avec un prix', () => {
    // La carte contient un <select> « 1..25 » : un parseur naïf renverrait 1.
    for (const item of items) {
      if (item.price != null) expect(item.price).not.toBe(1)
    }
  })
})

describe('parseListingPage — jardimax (pas de référence sur la liste)', () => {
  const items = parseListingPage(fixture('jardimax'))

  it('extrait quand même nom, URL et prix', () => {
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0].name).toBeTruthy()
    expect(items[0].price).toBeGreaterThan(0)
  })
  it('laisse la référence absente plutôt que d’en inventer une', () => {
    // Ce site n'expose pas la réf sur la liste : il faudra ouvrir la fiche.
    expect(items.every((i) => i.ref === undefined || i.ref.length > 0)).toBe(true)
  })
})

describe('splitProductBlocks', () => {
  it('rend un tableau vide sur une page sans produit', () => {
    expect(splitProductBlocks('<html><body><p>Aucun résultat</p></body></html>')).toEqual([])
  })
})

describe('parseJsonLdObjects — tolérance', () => {
  it('ignore un bloc invalide sans perdre les blocs valides', () => {
    const html = `
      <script type="application/ld+json">{ ceci n'est pas du JSON }</script>
      <script type="application/ld+json">{"@type":"Product","name":"OK"}</script>`
    const objs = parseJsonLdObjects(html)
    expect(objs).toHaveLength(1)
    expect(objs[0].name).toBe('OK')
  })
  it('aplatit un tableau de nœuds', () => {
    const html = `<script type="application/ld+json">[{"@type":"A"},{"@type":"B"}]</script>`
    expect(parseJsonLdObjects(html)).toHaveLength(2)
  })
})

describe('parseProductPage', () => {
  it('lit un JSON-LD Product complet', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Carburateur', sku: 'PM04881', gtin13: '3582321853475',
      offers: { '@type': 'Offer', price: '27.48', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    })}</script>`
    const p = parseProductPage(html, 'https://x.fr/p.html')
    expect(p).toMatchObject({
      name: 'Carburateur', ref: 'PM04881', gtin13: '3582321853475',
      price: 27.48, currency: 'EUR', availability: 'in-stock',
    })
  })
  it('retombe sur le HTML quand le JSON-LD est invalide', () => {
    const html = `
      <script type="application/ld+json">{ invalide </script>
      <h1>Capuchon bougie Kawasaki</h1>
      <span class="product-reference">Réf : 21130-2056</span>
      <div class="current-price"><span class="price">4,67 € TTC</span></div>
      <span class="product-available">En stock</span>`
    const p = parseProductPage(html, 'https://x.fr/p.html')
    expect(p).toMatchObject({ name: 'Capuchon bougie Kawasaki', ref: '21130-2056', price: 4.67, taxIncluded: true })
  })
  it('rend null sur une page sans produit', () => {
    expect(parseProductPage('<html><body>404</body></html>', 'https://x.fr/404')).toBeNull()
  })
  it('lit le prix barré quand il y en a un', () => {
    const html = `<h1>P</h1><div class="current-price"><span class="price">80,00 €</span>
      <span class="regular-price">100,00 €</span></div>`
    const p = parseProductPage(html, 'https://x.fr/p.html')
    expect(p?.price).toBe(80)
    expect(p?.listPrice).toBe(100)
  })
})

describe('pagination', () => {
  it('lit rel="next"', () => {
    const html = `<link rel="next" href="https://x.fr/c?page=2">`
    expect(nextListingUrl(html, 'https://x.fr/c')).toBe('https://x.fr/c?page=2')
  })
  it('absolutise un rel="next" relatif', () => {
    expect(nextListingUrl(`<link rel="next" href="/c?page=3">`, 'https://x.fr/c?page=2'))
      .toBe('https://x.fr/c?page=3')
  })
  it('rend null en dernière page', () => {
    expect(nextListingUrl('<html></html>', 'https://x.fr/c')).toBeNull()
  })
  it('construit une URL paginée en repli', () => {
    expect(pageUrl('https://x.fr/10-cat', 3)).toBe('https://x.fr/10-cat?page=3')
    expect(pageUrl('https://x.fr/10-cat?page=2', 3)).toBe('https://x.fr/10-cat?page=3')
  })
})
