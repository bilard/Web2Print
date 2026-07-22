import { describe, it, expect } from 'vitest'
import { krampAuthPass } from './krampAuthPass'
import type { DirectedSourceProduct } from './searchDirected'

const SEARCH_MD = '[Réservoir](https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601)'
const PRODUCT_MD = '## Réservoir hydro stiga\n#### Prix brut\n## 93,57 €'
const searchUrl = (q: string) => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`
const PROD_URL = 'https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601'

// Fake : recherche → markdown liste ; fiche → markdown produit.
function fakeScrape(map: Record<string, string>) {
  return async (urls: string[]) => new Map(urls.map((u) => [u, map[u] ?? '']))
}

describe('krampAuthPass', () => {
  it('apparie par réf exacte (points normalisés) et renvoie le prix HT', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '113438160/1', ean: '8008989408024' }]
    const scrape = fakeScrape({ [searchUrl('1134381601')]: SEARCH_MD, [PROD_URL]: PRODUCT_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].productId).toBe('p1')
    expect(hits[0].listing.price).toBe(93.57)
    expect(hits[0].listing.taxIncluded).toBe(false)
  })

  it('aucun hit si la fiche n’apparie aucune clé (zéro faux positif)', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p2', ref: '999999' }]
    const scrape = fakeScrape({ [searchUrl('999999')]: SEARCH_MD, [PROD_URL]: PRODUCT_MD }) // fiche = ref 1134381601 ≠ 999999
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(0)
  })

  it('respecte le signal d’abort', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '1134381601' }]
    const scrape = fakeScrape({})
    const hits = await krampAuthPass(products, { scrape, signal: { aborted: true } })
    expect(hits).toHaveLength(0)
  })
})
