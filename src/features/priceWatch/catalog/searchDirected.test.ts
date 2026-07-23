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

  it('les cartes de RECHERCHE jardimax livrent leur réf (label « Référence: » texte libre)', () => {
    // La page CATÉGORIE jardimax n’affiche pas la référence (l’index moissonné reste sans
    // clé — constaté en prod), mais la page de RECHERCHE l’affiche dans un simple <p>
    // (« RÉFÉRENCE: 325110501/0 »). Le repli label d’extractRef doit la capter pour que
    // la recherche dirigée puisse prouver l’appariement.
    const refs = parseListingPage(fixture('jardimax')).map((l) => l.ref).filter(Boolean)
    expect(refs).toContain('325110501/0')
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

describe('searchDirected — carte recherche avec « Référence: » en texte libre (jardimax)', () => {
  // Markup RÉEL relevé le 2026-07-23 sur /recherche?s=181004383 : la réf est dans un
  // simple <p> stylé (ni classe product-reference, ni itemprop=sku), avec le suffixe
  // de déclinaison PrestaShop « /0 ».
  const card = `
    <article class="product-item product-miniature js-product-miniature" data-id-product="134027" itemscope itemtype="http://schema.org/Product">
      <div class="thumbnail-container">
        <h3 class="product-title" itemprop="name"><a href="https://www.jardimax.com/p/134027-lame-mulching-51cm-tondeuse-stiga.html">Lame mulching tondeuse Ariens, GGP, Stiga</a></h3>
        <p style="padding:0;margin:0;text-align:center;font-size:14px;text-transform:uppercase;">Référence: 181004383/0</p>
        <span class="price">34,90 €</span>
      </div>
    </article>`

  it('parseListingPage lit la réf malgré l’absence de markup dédié', () => {
    const l = parseListingPage(card)
    expect(l).toHaveLength(1)
    expect(l[0].ref).toBe('181004383/0')
  })

  it('searchProductOnSite apparie la réf source à la carte (evidence sku)', async () => {
    const hit = await searchProductOnSite({ ref: '181004383' }, 'jardimax.com', {
      fetchHtml: async () => card,
    })
    expect(hit).not.toBeNull()
    expect(hit!.evidence).toBe('sku')
    expect(hit!.listing.price).toBe(34.9)
  })
})

describe('directedPass — débit', () => {
  it('interroge les sites d’un produit en PARALLÈLE (un site lent ne bloque pas les autres)', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const deps = {
      fetchHtml: async () => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise((r) => setTimeout(r, 5))
        concurrent--
        return null
      },
    }
    const sites = ['a', 'b', 'c'].map((s) => ({ siteId: s, domain: `${s}.fr` }))
    await directedPass([{ id: 'p', ref: 'REF12345' }], sites, 0, 1, deps)
    expect(maxConcurrent).toBeGreaterThan(1)
  })
})
