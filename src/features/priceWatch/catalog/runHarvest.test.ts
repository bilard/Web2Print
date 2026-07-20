// src/features/priceWatch/catalog/runHarvest.test.ts
// Teste l'orchestration de moisson avec des E/S factices — aucun réseau, aucune BD.
import { describe, it, expect } from 'vitest'
import { harvestPass, planCategories, type HarvestDeps, type CompetitorConfig } from './runHarvest'
import type { HarvestCursor } from './harvest'

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
