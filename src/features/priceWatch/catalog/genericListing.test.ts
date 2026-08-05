import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseListingGeneric } from './genericListing'

describe('parseListingGeneric (toute techno, JSON-LD)', () => {
  it('extrait les produits d’un ItemList (name/prix/stock/url)', () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'ItemList',
        itemListElement: [
          { '@type': 'ListItem', item: { '@type': 'Product', name: 'Courroie A97', url: '/p/a97', sku: 'A97',
            offers: { '@type': 'Offer', price: '19.90', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } } },
          { '@type': 'ListItem', item: { '@type': 'Product', name: 'Lame 42cm', url: 'https://x.com/p/lame', gtin13: '3661234567890',
            offers: { price: 34, priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' } } },
        ],
      })}</script></head><body></body></html>`
    const rows = parseListingGeneric(html, 'https://x.com/')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ name: 'Courroie A97', ref: 'A97', price: 19.9, currency: 'EUR', availability: 'in-stock' })
    expect(rows[0].url).toBe('https://x.com/p/a97') // relatif résolu
    expect(rows[1]).toMatchObject({ name: 'Lame 42cm', price: 34, gtin13: '3661234567890', availability: 'out-of-stock' })
  })

  it('gère @graph avec plusieurs Product', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@graph': [
        { '@type': 'Organization', name: 'Shop' },
        { '@type': 'Product', name: 'P1', offers: { price: 10, priceCurrency: 'EUR' } },
        { '@type': 'Product', name: 'P2', offers: { price: 20, priceCurrency: 'EUR' } },
      ],
    })}</script>`
    const rows = parseListingGeneric(html)
    expect(rows.map((r) => r.name)).toEqual(['P1', 'P2'])
  })

  it('rend [] quand aucun Product JSON-LD', () => {
    expect(parseListingGeneric('<html><body>rien</body></html>')).toEqual([])
  })
})

describe('gabarit CollectionPage (enseignes : castorama, Kingfisher…)', () => {
  const html = readFileSync(join(__dirname, '__fixtures__', 'listing-castorama.html'), 'utf-8')

  it('descend dans mainEntity → ItemList → ListItem.item', () => {
    const out = parseListingGeneric(html, 'https://www.castorama.fr/abri-de-jardin-metal/cat_id_0003374.cat')
    // Sans la descente `mainEntity`, la page entière rendait 0 produit.
    expect(out.length).toBe(3)
    expect(out[0]).toMatchObject({ price: 569, currency: 'EUR', ref: '3222871201653' })
    expect(out[0].url).toMatch(/^https:\/\/www\.castorama\.fr\//)
  })

  it('décode les entités HTML du JSON-LD (nom lisible, URL d’image utilisable)', () => {
    const out = parseListingGeneric(html, 'https://www.castorama.fr/')
    expect(out[0].name).toContain("d'ancrage")
    expect(out[0].name).not.toContain('&apos;')
    expect(out[0].image).not.toContain('&amp;')
  })
})

describe('URL d’image relative', () => {
  // Vécu : toutes les vignettes concurrentes cassées dans l'explorateur. L'URL produit
  // était absolutisée, l'image non — elle partait relative en base et le navigateur la
  // résolvait contre le domaine de l'application, pas celui du marchand.
  it('rend l’image absolue contre la page d’origine', () => {
    const ld = JSON.stringify({
      '@type': 'Product', name: 'Veste forestière', sku: 'V1',
      image: '/img/p/12-345.jpg',
      offers: { '@type': 'Offer', price: '106.02', priceCurrency: 'EUR' },
    })
    const [l] = parseListingGeneric(`<script type="application/ld+json">${ld}</script>`, 'https://m.fr/cat/veste.html')
    expect(l.image).toBe('https://m.fr/img/p/12-345.jpg')
  })

  it('laisse intactes les URL déjà absolues et les images inline', () => {
    const mk = (img: string) => JSON.stringify({
      '@type': 'Product', name: 'X', image: img,
      offers: { '@type': 'Offer', price: '1', priceCurrency: 'EUR' },
    })
    const of = (img: string) => parseListingGeneric(`<script type="application/ld+json">${mk(img)}</script>`, 'https://m.fr/p.html')[0].image
    expect(of('https://cdn.autre.fr/a.jpg')).toBe('https://cdn.autre.fr/a.jpg')
    expect(of('data:image/gif;base64,R0lGOD')).toBe('data:image/gif;base64,R0lGOD')
    // Protocole-relatif : hérite du schéma de la page, donc https.
    expect(of('//cdn.m.fr/a.jpg')).toBe('https://cdn.m.fr/a.jpg')
  })
})
