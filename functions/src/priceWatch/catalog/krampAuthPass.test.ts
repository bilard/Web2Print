import { describe, it, expect } from 'vitest'
import { krampAuthPass } from './krampAuthPass'
import type { DirectedSourceProduct } from './searchDirected'

const P = 'https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601'
const SEARCH_MD = `## 1 résultat de recherche
[Réservoir hydro stiga](${P})
93,57 €`
const searchUrl = (q: string) => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`

/** Fake : chaque URL de recherche → son markdown (défini) ou '' ; compte les appels. */
function fakeScrape(map: Record<string, string>) {
  const calls: string[] = []
  const fn = async (urls: string[]) => { calls.push(...urls); return new Map(urls.map((u) => [u, map[u] ?? ''])) }
  return Object.assign(fn, { calls })
}

describe('krampAuthPass', () => {
  it('cherche par réf BRUTE, apparie par réf normalisée, renvoie le prix HT (repli EAN NON fetché)', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '113438160/1', ean: '8008989408024' }]
    const scrape = fakeScrape({ [searchUrl('113438160/1')]: SEARCH_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].listing.price).toBe(93.57)
    expect(hits[0].listing.taxIncluded).toBe(false)
    expect(hits[0].listing.url).toBe(P)
    // Fetch PARESSEUX : la réf a apparié → l'EAN n'est jamais scrapé.
    expect(scrape.calls).not.toContain(searchUrl('8008989408024'))
  })

  it('aucun hit si la carte trouvée n’apparie aucune clé (zéro faux positif)', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p2', ref: '999999' }]
    const scrape = fakeScrape({ [searchUrl('999999')]: SEARCH_MD }) // carte réf 1134381601 ≠ 999999
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(0)
  })

  it('repli EAN : réf sans résultat → l’EAN est fetché et apparie', async () => {
    const products: DirectedSourceProduct[] = [{ id: 'p3', ref: '1134381601', ean: '8008989408024' }]
    // La recherche réf ne renvoie rien ; l'EAN retombe sur la carte.
    const scrape = fakeScrape({ [searchUrl('1134381601')]: '', [searchUrl('8008989408024')]: SEARCH_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].listing.price).toBe(93.57)
    expect(scrape.calls).toContain(searchUrl('8008989408024'))
  })

  it('multi-résultats : retient le prix de la carte APPARIÉE, pas de la 1re', async () => {
    const OTHER = 'https://www.kramp.com/shop-fr/fr/p/autre--0000'
    const md = `[Autre produit](${OTHER})\n10,00 €\n[Réservoir](${P})\n93,57 €`
    const products: DirectedSourceProduct[] = [{ id: 'p4', ref: '1134381601' }]
    const scrape = fakeScrape({ [searchUrl('1134381601')]: md })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].listing.ref).toBe('1134381601')
    expect(hits[0].listing.price).toBe(93.57) // pas 10,00 (carte « Autre »)
  })

  it('respecte le signal d’abort (aucun appel scrape)', async () => {
    const scrape = fakeScrape({})
    const hits = await krampAuthPass([{ id: 'p1', ref: '1134381601' }], { scrape, signal: { aborted: true } })
    expect(hits).toHaveLength(0)
    expect(scrape.calls).toHaveLength(0)
  })
})
