import { describe, it, expect } from 'vitest'
import { krampAuthPass } from './krampAuthPass'
import type { DirectedSourceProduct } from './searchDirected'

const P = 'https://www.kramp.com/shop-fr/fr/p/reservoir-hydro-stiga--1134381601'
// Page de RECHERCHE connectée (une phase) : URL fiche + nom + prix HT.
const SEARCH_MD = `## 1 résultat de recherche
[Réservoir hydro stiga](${P})
Afficher le stock
93,57 €`
const searchUrl = (q: string) => `https://www.kramp.com/shop-fr/fr/search/${encodeURIComponent(q)}`

/** Fake : chaque URL de recherche → son markdown (défini) ou '' (aucun résultat). */
function fakeScrape(map: Record<string, string>) {
  return async (urls: string[]) => new Map(urls.map((u) => [u, map[u] ?? '']))
}

describe('krampAuthPass', () => {
  it('cherche par réf BRUTE, apparie par réf normalisée, renvoie le prix HT', async () => {
    // La réf source « 113438160/1 » est cherchée telle quelle ; l'appariement normalise
    // (retire « / ») → « 1134381601 » = la réf de la fiche kramp.
    const products: DirectedSourceProduct[] = [{ id: 'p1', ref: '113438160/1', ean: '8008989408024' }]
    const scrape = fakeScrape({ [searchUrl('113438160/1')]: SEARCH_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].productId).toBe('p1')
    expect(hits[0].listing.price).toBe(93.57)
    expect(hits[0].listing.taxIncluded).toBe(false)
    expect(hits[0].listing.url).toBe(P)
  })

  it('aucun hit si la fiche trouvée n’apparie aucune clé (zéro faux positif)', async () => {
    // La recherche « 999999 » renvoie (par hypothèse) la fiche réf 1134381601 ≠ 999999.
    const products: DirectedSourceProduct[] = [{ id: 'p2', ref: '999999' }]
    const scrape = fakeScrape({ [searchUrl('999999')]: SEARCH_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(0)
  })

  it('repli EAN : si la recherche réf ne donne rien, tente l’EAN', async () => {
    // Réf exotique introuvable (''), mais l'EAN retombe sur la fiche dont la réf 1134381601
    // apparie la réf source (ici la source A la réf aussi) → hit.
    const products: DirectedSourceProduct[] = [{ id: 'p3', ref: '1134381601', ean: '8008989408024' }]
    const scrape = fakeScrape({ [searchUrl('1134381601')]: '', [searchUrl('8008989408024')]: SEARCH_MD })
    const hits = await krampAuthPass(products, { scrape })
    expect(hits).toHaveLength(1)
    expect(hits[0].listing.price).toBe(93.57)
  })

  it('respecte le signal d’abort (aucun appel scrape)', async () => {
    let called = false
    const scrape = async (urls: string[]) => { called = true; return new Map(urls.map((u) => [u, ''])) }
    const hits = await krampAuthPass([{ id: 'p1', ref: '1134381601' }], { scrape, signal: { aborted: true } })
    expect(hits).toHaveLength(0)
    expect(called).toBe(false)
  })
})
