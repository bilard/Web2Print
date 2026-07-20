// functions/src/priceWatch/catalog/catalogParity.test.ts
// Les modules purs de ce dossier sont DUPLIQUÉS depuis src/features/priceWatch/catalog/
// (client/serveur ne partagent pas le code). Ce test de parité exerce les fonctions clés
// côté serveur : il garde-fou contre une dérive silencieuse de la copie, et couvre les
// exports que seule la suite client utilisait autrement.
import { describe, it, expect } from 'vitest'
import {
  parsePriceFragment, splitProductBlocks, extractAvailability,
  parseJsonLdObjects, parseProductPage,
} from './prestashop'
import { indexKeysOf, buildMemoryIndex, matchProduct } from './match'
import { foldText, keywordsForFamilies } from './categories'
import { MAX_PAGES_PER_CATEGORY, initCursor, advance } from './harvest'
import { planCategories, type CompetitorConfig, type HarvestDeps } from './runHarvest'

describe('prestashop (parité serveur)', () => {
  it('parse les prix marchands', () => {
    expect(parsePriceFragment('4,67 € TTC')).toBe(4.67)
    expect(parsePriceFragment('1 299,90 €')).toBe(1299.9)
    expect(parsePriceFragment('Prix sur demande')).toBeUndefined()
  })
  it('splitProductBlocks : vide sans produit', () => {
    expect(splitProductBlocks('<p>Aucun résultat</p>')).toEqual([])
  })
  it('extractAvailability : schema.org et libellés FR', () => {
    expect(extractAvailability('schema.org/InStock')).toBe('in-stock')
    expect(extractAvailability('<span>Rupture de stock</span>')).toBe('out-of-stock')
  })
  it('parseJsonLdObjects : tolère un bloc invalide', () => {
    const html = `<script type="application/ld+json">{ invalide }</script>
      <script type="application/ld+json">{"@type":"Product","name":"OK"}</script>`
    expect(parseJsonLdObjects(html)).toHaveLength(1)
  })
  it('parseProductPage : lit un JSON-LD Product', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Carburateur', sku: 'PM04881', gtin13: '3582321853475',
      offers: { price: '27.48', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    })}</script>`
    expect(parseProductPage(html, 'https://x.fr/p.html')).toMatchObject({
      name: 'Carburateur', ref: 'PM04881', price: 27.48, availability: 'in-stock',
    })
  })
})

describe('match (parité serveur)', () => {
  it('indexe et apparie par égalité exacte', () => {
    const listings = [{ url: 'https://x.fr/a.html', name: 'Alternateur', ref: 'BS691991', price: 98 }]
    expect(indexKeysOf(listings[0])).toContain('BS691991')
    const lookup = buildMemoryIndex(listings)
    const r = matchProduct({ id: 'a', name: 'Alt', ref: 'BS691991' }, 's', lookup)
    expect(r.outcome).toBe('matched')
  })
})

describe('categories + harvest (parité serveur)', () => {
  it('foldText retire les accents', () => {
    expect(foldText('Courroies Écrémées')).toBe('courroies ecremees')
  })
  it('mappe les familles vers des mots-clés de slug', () => {
    expect(keywordsForFamilies(['COURROIES'])).toContain('courroie')
  })
  it('le curseur clôt la catégorie au plafond de pages', () => {
    let c = initCursor(['https://x.fr/10-courroies'])
    for (let i = 0; i < MAX_PAGES_PER_CATEGORY + 2; i++) c = advance(c, { hadItems: true, hasNext: true })
    expect(c.done).toBe(true)
  })
})

describe('runHarvest (parité serveur)', () => {
  it('planCategories filtre les catégories par famille depuis l’accueil', async () => {
    const cfg: CompetitorConfig = { siteId: 's', domain: 'x.fr', families: ['COURROIES'] }
    const home =
      '<a href="https://www.x.fr/10-courroies">Courroies</a>' +
      '<a href="https://www.x.fr/20-filtres">Filtres</a>'
    const deps: HarvestDeps = {
      fetchHtml: async () => home,
      loadCursor: async () => null,
      saveCursor: async () => {},
      savePage: async () => {},
    }
    const cats = await planCategories(cfg, deps)
    expect(cats).toEqual(['https://www.x.fr/10-courroies'])
  })
})
