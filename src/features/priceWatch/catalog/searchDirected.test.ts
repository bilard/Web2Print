import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseListingPage } from './prestashop'
import { searchProductOnSite, searchUrl, directedPass } from './searchDirected'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '__fixtures__', `listing-${name}.html`), 'utf-8')

describe('searchDirected — recherche dirigée par clé', () => {
  it('construit l’URL du moteur de recherche PrestaShop', () => {
    expect(searchUrl('jardimax.com', 'A97')).toBe(
      'https://jardimax.com/recherche?controller=search&s=A97',
    )
    expect(searchUrl('https://www.jardimax.com/', 'courroie A97')).toBe(
      'https://www.jardimax.com/recherche?controller=search&s=courroie%20A97',
    )
  })

  it('les cartes de LISTE jardimax n’exposent pas de réf → la moisson par liste les rate', () => {
    // Cœur du problème : sur une page catégorie, jardimax n’affiche pas la référence.
    // L’appariement par réf est donc impossible depuis la moisson — mais la page de
    // RECHERCHE, elle, l’affiche (« RÉFÉRENCE: A97 » vérifié en live). D’où la recherche dirigée.
    const withRef = parseListingPage(fixture('jardimax')).find((l) => (l.ref?.length ?? 0) >= 4)
    expect(withRef).toBeUndefined()
  })

  it('apparie un produit à un résultat de recherche par sa réf (HTML réel avec réf)', async () => {
    const html = fixture('pro-motoculture') // fixture où la réf EST affichée
    const withRef = parseListingPage(html).find((l) => (l.ref?.length ?? 0) >= 5)
    expect(withRef?.ref).toBeTruthy()

    const hit = await searchProductOnSite({ ref: withRef!.ref }, 'pro-motoculture.com', {
      fetchHtml: async () => html,
    })

    expect(hit).not.toBeNull()
    expect(hit!.listing.ref).toBe(withRef!.ref)
    // Preuve par égalité exacte — jamais le nom seul.
    expect(['sku', 'ref-in-name', 'mpn', 'gtin13', 'ean-in-url']).toContain(hit!.evidence)
  })

  it('renvoie null quand la réf source n’est chez aucun résultat', async () => {
    const hit = await searchProductOnSite({ ref: 'ZZZINEXISTANT999' }, 'jardimax.com', {
      fetchHtml: async () => fixture('jardimax'),
    })
    expect(hit).toBeNull()
  })

  it('directedPass avance le curseur du budget et rattache les hits par produit', async () => {
    const html = fixture('pro-motoculture')
    const knownRef = parseListingPage(html).find((l) => (l.ref?.length ?? 0) >= 5)!.ref!
    const sites = [{ siteId: 's1', domain: 'pro-motoculture.com' }]
    const products = [
      { id: 'p0', ref: knownRef },
      { id: 'p1', ref: 'INEXISTANT999' },
      { id: 'p2', ref: knownRef },
    ]
    const deps = { fetchHtml: async () => html }

    const r1 = await directedPass(products, sites, 0, 2, deps)
    expect(r1.processed).toBe(2)
    expect(r1.nextCursor).toBe(2)
    expect(r1.done).toBe(false)
    expect(r1.results.map((x) => x.productId)).toEqual(['p0']) // p1 sans réf connue → pas de hit

    const r2 = await directedPass(products, sites, r1.nextCursor, 2, deps)
    expect(r2.processed).toBe(1)
    expect(r2.done).toBe(true)
    expect(r2.nextCursor).toBe(0) // balayage terminé → recommence au prochain cycle
    expect(r2.results.map((x) => x.productId)).toEqual(['p2'])
  })
})

describe('searchDirected — mode GÉNÉRIQUE (marketplaces)', () => {
  it('cherche sur le web puis extrait via Firecrawl, apparié par la réf extraite', async () => {
    const calls: string[] = []
    const hit = await searchProductOnSite(
      { ref: 'A97' },
      'kramp.com',
      {
        fetchHtml: async () => { throw new Error('ne doit pas fetcher le moteur PrestaShop en mode générique') },
        searchWeb: async (q) => { calls.push(q); return ['https://www.kramp.com/shop/p/courroie-a97'] },
        // Firecrawl extrait la référence de la fiche → preuve par égalité exacte.
        extractProduct: async (url) => ({ url, name: 'Courroie A97', ref: 'A97', price: 19.9, currency: 'EUR', taxIncluded: true }),
      },
      { generic: true },
    )
    expect(calls[0]).toBe('site:kramp.com A97')
    expect(hit?.listing.price).toBe(19.9)
    expect(hit?.evidence).toBeDefined()
  })

  it('rend null si l’extraction ne donne pas de preuve exacte', async () => {
    const hit = await searchProductOnSite(
      { ref: 'A97' },
      'kramp.com',
      {
        fetchHtml: async () => null,
        searchWeb: async () => ['https://www.kramp.com/shop/p/autre-produit-123'],
        extractProduct: async (url) => ({ url, name: 'Autre produit', price: 10, currency: 'EUR' }),
      },
      { generic: true },
    )
    expect(hit).toBeNull()
  })
})

describe('preferProductUrls', () => {
  it('remonte les fiches produit avant les catégories/recherche', async () => {
    const { preferProductUrls } = await import('./searchDirected')
    const ranked = preferProductUrls([
      'https://www.manomano.fr/cat/courroie-alpina',
      'https://www.manomano.fr/p/courroie-alpina-al7-210323553',
      'https://www.cdiscount.com/jardin/r-courroie+ggp.html',
      'https://www.cdiscount.com/jardin/x/f-1632601-auc17198.html',
    ])
    expect(ranked[0]).toContain('/p/')
    expect(ranked[ranked.length - 1]).toMatch(/\/r-|\/cat\//)
  })
})
