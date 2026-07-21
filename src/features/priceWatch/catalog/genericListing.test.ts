import { describe, it, expect } from 'vitest'
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
