// Teste l'orchestration de moisson avec des E/S factices — aucun réseau, aucune BD.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { harvestPass, planCategories, extractListingProducts, type HarvestDeps, type CompetitorConfig } from './runHarvest'
import { PLAN_RETRY_COOLDOWN_MS, type HarvestCursor } from './harvest'

const cfg: CompetitorConfig = { siteId: 'c', domain: 'c.fr', families: ['COURROIES'] }

/** Fabrique un faux site : accueil listant des catégories + pages produit paginées. */
function fakeSite(pagesPerCat: Record<string, number>) {
  const home = Object.keys(pagesPerCat)
    .map((url) => `<a href="${url}">cat</a>`)
    .join('\n')
  const card = (ref: string, price: number) =>
    `<article class="product-miniature">
      <a href="https://www.c.fr/${ref}.html">x</a>
      <p class="product-title"><a href="https://www.c.fr/${ref}.html">Courroie ${ref}</a></p>
      <div class="product-reference">Réf : ${ref}</div>
      <span class="product-price" content="${price}">${price},00 €</span>
    </article>`
  const fetchHtml = async (url: string): Promise<string | null> => {
    if (url === 'https://www.c.fr/') return home
    for (const [catUrl, n] of Object.entries(pagesPerCat)) {
      const base = catUrl
      const page = url === base ? 1 : Number(new URL(url).searchParams.get('page') ?? 1)
      if (url === base || url.startsWith(base)) {
        if (page > n) return `<html>vide</html>`
        const cards = Array.from({ length: 3 }, (_, i) => card(`${page}${i}`, page * 10 + i)).join('')
        const next = page < n ? `<link rel="next" href="${base}?page=${page + 1}">` : ''
        return `<html>${next}${cards}</html>`
      }
    }
    return null
  }
  return fetchHtml
}

function memoryDeps(fetchHtml: (url: string) => Promise<string | null>): HarvestDeps & {
  cursors: Map<string, HarvestCursor>; pages: Map<string, number>
} {
  const cursors = new Map<string, HarvestCursor>()
  const pages = new Map<string, number>()
  return {
    fetchHtml,
    loadCursor: async (id) => cursors.get(id) ?? null,
    saveCursor: async (id, c) => { cursors.set(id, c) },
    savePage: async (id, pageId, _url, _page, products) => { pages.set(`${id}/${pageId}`, products.length) },
    cursors, pages,
  }
}

describe('planCategories', () => {
  it('cible les catégories des familles demandées', async () => {
    const deps = memoryDeps(fakeSite({
      'https://www.c.fr/1-courroies': 1, 'https://www.c.fr/2-visserie': 1,
    }))
    expect(await planCategories(cfg, deps)).toEqual(['https://www.c.fr/1-courroies'])
  })
  it('rend [] si l’accueil est injoignable', async () => {
    const deps = memoryDeps(async () => null)
    expect(await planCategories(cfg, deps)).toEqual([])
  })
})

describe('harvestPass', () => {
  it('moissonne dans la limite du budget, persiste le curseur', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 3 }))
    const r = await harvestPass(cfg, deps, 2)
    expect(r.pagesFetched).toBe(2)
    expect(r.productsIndexed).toBe(6) // 2 pages × 3 produits
    expect(r.sweepComplete).toBe(false)
    expect(deps.cursors.get('c')).toBeDefined()
  })

  it('reprend le curseur au tick suivant, jusqu’à terminer le balayage', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 3 }))
    await harvestPass(cfg, deps, 2)         // pages 1-2
    const r2 = await harvestPass(cfg, deps, 5) // page 3 puis fin
    expect(r2.sweepComplete).toBe(true)
    // 3 pages moissonnées au total → 3 docs de page.
    expect([...deps.pages.keys()].length).toBe(3)
  })

  it('rouvre un balayage (refresh) après achèvement', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 1 }))
    await harvestPass(cfg, deps, 5) // termine le balayage
    expect(deps.cursors.get('c')?.done).toBe(true)
    const r = await harvestPass(cfg, deps, 5) // refresh
    expect(r.productsIndexed).toBeGreaterThan(0)
    expect(deps.cursors.get('c')?.sweeps).toBe(1)
  })

  it('s’arrête proprement si aucune catégorie cible', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/2-visserie': 1 }))
    const r = await harvestPass(cfg, deps, 5)
    expect(r.pagesFetched).toBe(0)
    expect(r.sweepComplete).toBe(true)
  })

  it('respecte le signal d’abandon', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 10 }))
    const ac = new AbortController()
    ac.abort()
    const r = await harvestPass(cfg, { ...deps, signal: ac.signal }, 5)
    expect(r.pagesFetched).toBe(0)
  })
})

describe('extractListingProducts (cascade)', () => {
  const URL_CAT = 'https://www.c.fr/fr/jardinage/tondeuse'
  // Page catégorie qui se publie elle-même en JSON-LD Product (pratique SEO courante) :
  // 1 pseudo-produit à 0,29 € qui masquait les vraies cartes du DOM.
  const selfProduct = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Product',
    name: 'Pièces détachées pour tondeuses', url: URL_CAT,
    offers: { '@type': 'Offer', price: 0.29, priceCurrency: 'EUR' },
  })}</script>`
  const card = (n: number) =>
    `<div class="product"><a href="https://www.c.fr/p${n}.html">Courroie ${n}</a><span>1${n},90 €</span></div>`

  it('la catégorie déguisée en Product ne masque plus les cartes du DOM', () => {
    const out = extractListingProducts(`<html>${selfProduct}${card(1)}${card(2)}${card(3)}</html>`, URL_CAT)
    expect(out).toHaveLength(3)
    expect(out.map((p) => p.price)).not.toContain(0.29)
  })

  it('préserve la page FICHE, qui n’expose légitimement qu’un produit', () => {
    const out = extractListingProducts(`<html>${selfProduct}</html>`, URL_CAT)
    expect(out).toHaveLength(1)
    expect(out[0].price).toBe(0.29)
  })
})

describe('pagination par segment de chemin', () => {
  // Site qui ignore `?page=N` et pagine par `/N` (swap-europe) : sans suivi du
  // `rel="next"`, la page 2 resert la page 1 → verrou d'empreinte → 1 page sur N.
  function pathPaginatedSite(pages: number) {
    const base = 'https://www.c.fr/1-courroies'
    const card = (p: number, i: number) =>
      `<div class="product"><a href="https://www.c.fr/p${p}-${i}.html">Courroie ${p}-${i}</a><span>${p}${i},00 €</span></div>`
    return async (url: string): Promise<string | null> => {
      if (url === 'https://www.c.fr/') return `<a href="${base}">cat</a>`
      const m = url.match(/^https:\/\/www\.c\.fr\/1-courroies(?:\/(\d+))?(?:\?.*)?$/)
      if (!m) return null
      const page = Number(m[1] ?? 1) // `?page=N` NON honoré : toujours la page 1
      if (page > pages) return '<html>vide</html>'
      const next = page < pages ? `<link rel="next" href="${base}/${page + 1}">` : ''
      return `<html>${next}${card(page, 1)}${card(page, 2)}</html>`
    }
  }

  it('suit le rel="next" et moissonne toutes les pages', async () => {
    const deps = memoryDeps(pathPaginatedSite(4))
    const r = await harvestPass(cfg, deps, 10)
    expect(r.pagesFetched).toBe(4)
    expect(r.productsIndexed).toBe(8) // 4 pages × 2 produits, aucun doublon
    expect(r.sweepComplete).toBe(true)
  })

  it('reprend la pagination au tick suivant (URL suivante persistée)', async () => {
    const deps = memoryDeps(pathPaginatedSite(4))
    await harvestPass(cfg, deps, 2)
    expect(deps.cursors.get('c')?.nextUrl).toBe('https://www.c.fr/1-courroies/3')
    const r2 = await harvestPass(cfg, deps, 10)
    expect(r2.productsIndexed).toBe(4) // pages 3 et 4
  })
})

describe('extractListingProducts — non-régression sur les sites déjà couverts', () => {
  const fixture = (name: string) =>
    readFileSync(join(__dirname, '__fixtures__', `listing-${name}.html`), 'utf-8')

  // La cascade est ce que ce correctif a changé : ces deux fixtures vérifient qu'un site
  // servi par le palier PrestaShop et un site servi par le JSON-LD gagnent toujours.
  it('jardimax (cartes PrestaShop) reste servi par le palier 1', () => {
    const out = extractListingProducts(fixture('jardimax'), 'https://www.jardimax.com/')
    expect(out.length).toBeGreaterThanOrEqual(2)
    expect(out.every((p) => p.url.startsWith('http'))).toBe(true)
  })

  it('castorama (JSON-LD de page catégorie) reste servi par le palier 2', () => {
    const out = extractListingProducts(fixture('castorama'), 'https://www.castorama.fr/')
    expect(out.length).toBeGreaterThanOrEqual(2)
  })
})

describe('mise en veille de la découverte après un échec', () => {
  // Le sondage coûte jusqu'à 24 requêtes. Sur un site que la découverte ne sait pas lire,
  // il rendait [] puis recommençait au tick SUIVANT — sur tous les concurrents à la fois.
  const blind = { siteId: 'c', domain: 'c.fr', families: [] }

  function counting() {
    let fetches = 0
    const d = memoryDeps(async (url) => { fetches++; return url === 'https://www.c.fr/' ? '<html>rien</html>' : null })
    return { d, fetches: () => fetches }
  }

  it('le 2ᵉ tick ne repaie pas la découverte', async () => {
    const { d, fetches } = counting()
    await harvestPass(blind, d, 5)
    const afterFirst = fetches()
    expect(afterFirst).toBeGreaterThan(0)
    const r = await harvestPass(blind, d, 5)
    expect(fetches()).toBe(afterFirst) // aucune requête de plus
    expect(r.pagesFetched).toBe(0)
  })

  it('l’échec est PERSISTÉ (sinon le tick suivant repart de zéro)', async () => {
    const { d } = counting()
    await harvestPass(blind, d, 5)
    expect(d.cursors.get('c')?.planFailedAt).toBeGreaterThan(0)
  })

  it('la veille expire — la découverte re-tente après le délai', async () => {
    const { d, fetches } = counting()
    await harvestPass(blind, d, 5)
    const afterFirst = fetches()
    const later = Date.now() + PLAN_RETRY_COOLDOWN_MS + 1
    await harvestPass(blind, { ...d, now: () => later }, 5)
    expect(fetches()).toBeGreaterThan(afterFirst)
  })

  it('la relance MANUELLE (force) ignore la veille', async () => {
    const { d, fetches } = counting()
    await harvestPass(blind, d, 5)
    const afterFirst = fetches()
    await harvestPass(blind, { ...d, force: true }, 5)
    expect(fetches()).toBeGreaterThan(afterFirst)
  })

  it('un plan retrouvé lève la veille', async () => {
    const d = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 1 }))
    d.cursors.set('c', { categories: [], catIndex: 0, page: 1, sweeps: 0, done: true, planFailedAt: 1 })
    const r = await harvestPass({ ...blind, families: ['COURROIES'] }, { ...d, now: () => PLAN_RETRY_COOLDOWN_MS + 2 }, 5)
    expect(r.productsIndexed).toBeGreaterThan(0)
    expect(d.cursors.get('c')?.planFailedAt).toBeUndefined()
  })
})

describe('restitution sur échéance', () => {
  // Sans elle, `pageBudget` est le seul gouverneur : le régler haut pour collecter
  // davantage risquait de faire déborder la fenêtre du run et d'affamer « Comparer ».
  it('rend la main à l’échéance, budget de pages NON épuisé', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 50 }))
    let clock = 1_000
    const r = await harvestPass(cfg, {
      ...deps,
      // Chaque lecture d'horloge avance de 10 s : la 3ᵉ page franchit l'échéance.
      now: () => (clock += 10_000),
      deadlineAt: 1_000 + 25_000,
    }, 100)
    expect(r.pagesFetched).toBeLessThan(100)
    expect(r.pagesFetched).toBeGreaterThan(0)
    expect(r.sweepComplete).toBe(false)
  })

  it('le curseur persiste — la passe suivante reprend où celle-ci s’arrête', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 50 }))
    let clock = 1_000
    await harvestPass(cfg, { ...deps, now: () => (clock += 10_000), deadlineAt: 1_000 + 25_000 }, 100)
    const stopped = deps.cursors.get('c')!
    expect(stopped.done).toBe(false)
    const r2 = await harvestPass(cfg, deps, 3)
    expect(r2.pagesFetched).toBe(3) // reprise normale, sans échéance
  })

  it('sans échéance, le budget de pages reste le gouverneur (comportement inchangé)', async () => {
    const deps = memoryDeps(fakeSite({ 'https://www.c.fr/1-courroies': 50 }))
    const r = await harvestPass(cfg, deps, 4)
    expect(r.pagesFetched).toBe(4)
  })
})

describe('⚠⚠ descente dans les sous-rayons pendant la moisson', () => {
  it('ajoute au plan les sous-rayons vus dans une page déjà payée', async () => {
    // granit-parts.fr : 82 rayons visibles depuis l'accueil, 900 fiches, balayage annoncé
    // « 100 % » — cent pour cent de ce qu'on savait chercher, une fraction du catalogue.
    // Les sous-rayons ne se découvrent qu'en ouvrant un rayon.
    const page = (kids: string[]) => `<html>${kids.map((k) => `<a href="${k}">x</a>`).join('')}
      <div class="product-miniature"><a href="/p/a.html">Article A</a><span class="price">10 €</span></div>
      <div class="product-miniature"><a href="/p/b.html">Article B</a><span class="price">12 €</span></div></html>`
    let saved: string[] = []
    const cursors: HarvestCursor[] = []
    await harvestPass(
      { siteId: 's', domain: 'shop.fr', families: [] },
      {
        force: true,
        fetchHtml: async () => page(['/c/moteur/filtres', '/c/moteur/courroies']),
        loadCursor: async () => ({
          categories: ['https://shop.fr/c/moteur'], catIndex: 0, page: 1, sweeps: 0, done: false,
        }),
        saveCursor: async (_id, c) => { cursors.push(c) },
        savePage: async (_id, _p, url) => { saved.push(url) },
      },
      1,
    )
    const last = cursors[cursors.length - 1]
    expect(last.categories).toContain('https://shop.fr/c/moteur/filtres')
    expect(last.categories).toContain('https://shop.fr/c/moteur/courroies')
    // ⚠ Le plan ne PERD jamais rien : le curseur progresse par index, un retrait le
    // ferait sauter des rayons en silence.
    expect(last.categories[0]).toBe('https://shop.fr/c/moteur')
    expect(saved).toHaveLength(1)
  })
})
