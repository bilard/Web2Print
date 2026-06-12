import { describe, it, expect } from 'vitest'
import { normalizeUrlKey, selectDiscoveryEntries } from '../discoverLinks'

// Reproduit le cas réel makita.fr : le méga-menu (centaines de liens
// /products/*.html catégories) précède la grille produit hydratée en AJAX
// (fiches à la racine /ref.html).
const MENU = [
  'https://www.makita.fr/products/machines-sans-fil.html',
  'https://www.makita.fr/products/machines-sans-fil-72v.html',
  'https://www.makita.fr/products/machines-sans-fil-12v.html',
  'https://www.makita.fr/products/lasers.html',
  'https://www.makita.fr/garantie-commerciale.html',
  'https://www.makita.fr/contactez-nous.html',
]
const GRID = [
  { url: 'https://www.makita.fr/df333dsme.html', title: 'Perceuse visseuse DF333DSME' },
  { url: 'https://www.makita.fr/hp333dsax3.html', title: 'Perceuse à percussion HP333DSAX3' },
  { url: 'https://www.makita.fr/td110dsme.html', title: 'Visseuse à chocs TD110DSME' },
  { url: 'https://www.makita.fr/cl121dz.html', title: 'Aspirateur CL121DZ' },
]

describe('normalizeUrlKey', () => {
  it('neutralise www, slash final et hash', () => {
    expect(normalizeUrlKey('https://www.makita.fr/df333dsme.html#specs'))
      .toBe(normalizeUrlKey('https://makita.fr/df333dsme.html/'))
  })
  it('conserve la query string (différencie des variantes produit)', () => {
    expect(normalizeUrlKey('https://a.fr/p?sku=1')).not.toBe(normalizeUrlKey('https://a.fr/p?sku=2'))
  })
})

describe('selectDiscoveryEntries', () => {
  it('tier cards : ne retourne QUE la grille quand la CF l\'a identifiée', () => {
    const { entries, tier } = selectDiscoveryEntries({
      jinaEntries: MENU.map((u) => ['menu', u]),
      cloudLinks: [...MENU, ...GRID.map((g) => g.url)],
      cloudNavLinks: MENU,
      cloudCardLinks: GRID,
    })
    expect(tier).toBe('cards')
    expect(entries.map(([, u]) => u)).toEqual(GRID.map((g) => g.url))
    expect(entries[0][0]).toBe('Perceuse visseuse DF333DSME')
  })

  it('tier content : soustrait la navigation de l\'union Jina ∪ cloud', () => {
    const { entries, tier } = selectDiscoveryEntries({
      jinaEntries: [...MENU.map((u) => ['menu', u] as [string, string]), ['Fiche', GRID[0].url]],
      cloudLinks: MENU,
      cloudNavLinks: MENU,
      cloudCardLinks: [], // grille non rendue côté CF
    })
    expect(tier).toBe('content')
    expect(entries.map(([, u]) => u)).toEqual([GRID[0].url])
  })

  it('tier content : un lien à la fois nav et carte reste candidat', () => {
    const { entries } = selectDiscoveryEntries({
      jinaEntries: [],
      cloudLinks: [],
      cloudNavLinks: [GRID[0].url, ...MENU],
      cloudCardLinks: [GRID[0], GRID[1]], // < 3 cartes → pas de tier cards
    })
    expect(entries.map(([, u]) => u)).toContain(GRID[0].url)
  })

  it('tier all : sans classification CF, union brute (comportement historique)', () => {
    const { entries, tier } = selectDiscoveryEntries({
      jinaEntries: MENU.map((u) => ['menu', u]),
      cloudLinks: GRID.map((g) => g.url),
      cloudNavLinks: [],
      cloudCardLinks: [],
    })
    expect(tier).toBe('all')
    expect(entries.length).toBe(MENU.length + GRID.length)
    // Les liens cloud sans titre reçoivent un titre dérivé du slug.
    expect(entries.find(([, u]) => u === GRID[0].url)?.[0]).toBe('df333dsme')
  })
})
