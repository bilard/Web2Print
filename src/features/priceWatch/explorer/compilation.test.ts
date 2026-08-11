import { describe, it, expect } from 'vitest'
import { compileSite, compileBySite, isSuspect, rowDomain, rowSiteId } from './compilation'
import { pairSiteListings } from './pairing'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/competitorListing'

const products: SourceProduct[] = [
  { id: 'p1', name: 'Courroie tondeuse', ref: 'AB-12X', ean: '4049582395377', price: 100 },
  { id: 'p2', name: 'Filtre à air', ref: 'XYZ-9', ean: '3701234567890', price: 50 },
]

const listings: CompetitorListing[] = [
  // Code-barres déclaré des deux côtés : acquis, donc HORS compilation.
  { url: 'https://c.fr/filtre', name: 'Filtre à air universel', gtin13: '3701234567890', price: 48 },
  // Référence lue dans le libellé, aucun champ structuré : c'est le cas qui mérite l'œil.
  { url: 'https://c.fr/courroie', name: 'Courroie de coupe AB-12X pour tondeuse', price: 108 },
  // Fiche que le catalogue ne référence pas : rien à valider, elle sort aussi.
  { url: 'https://c.fr/inconnu', name: 'Article que je ne vends pas', ref: 'ZZZ-0', price: 30 },
]

describe('isSuspect', () => {
  it('ne retient QUE les lignes appariées et non acquises', () => {
    const rows = pairSiteListings(products, 's1', listings, { vatRate: 0.2 })
    const bands = new Map(rows.map((r) => [r.key, r.confidence?.band ?? null]))
    expect(bands.get('https://c.fr/filtre')).toBe('sure')
    expect(bands.get('https://c.fr/inconnu')).toBeNull()

    expect(rows.filter(isSuspect).map((r) => r.key)).toEqual(['https://c.fr/courroie'])
  })
})

describe('compileSite', () => {
  it('marque chaque ligne de son concurrent — sans lui, on ne sait plus qui l’on valide', () => {
    const out = compileSite({ siteId: 's1', domain: 'c.fr' }, products, listings, { vatRate: 0.2 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ siteId: 's1', domain: 'c.fr' })
    expect(out[0].source?.id).toBe('p1')
  })

  it('produit EXACTEMENT les lignes de l’onglet du site, filtre en moins', () => {
    // Garde-fou : deux écrans qui apparieraient différemment les mêmes données se
    // contrediraient, et la compilation ne serait plus une preuve.
    const opts = { vatRate: 0.2 }
    const onglet = pairSiteListings(products, 's1', listings, opts).filter(isSuspect)
    const compile = compileSite({ siteId: 's1', domain: 'c.fr' }, products, listings, opts)
    expect(compile.map((r) => ({ key: r.key, score: r.confidence?.score })))
      .toEqual(onglet.map((r) => ({ key: r.key, score: r.confidence?.score })))
  })

  it('fait entrer une ligne ACQUISE que les photos démentent', () => {
    // Le verdict visuel entre dans l'indice : sans lui, l'appariement le plus douteux du
    // lot — celui que les images contredisent — resterait « sûr » et sortirait de la file
    // de travail. C'est exactement l'inverse du but de l'écran.
    const sansVisuel = compileSite({ siteId: 's1', domain: 'c.fr' }, products, listings, {})
    expect(sansVisuel.map((r) => r.key)).toEqual(['https://c.fr/courroie'])

    const avecVisuel = compileSite({ siteId: 's1', domain: 'c.fr' }, products, listings, {},
      (url) => (url === 'https://c.fr/filtre' ? 'different' : null))
    expect(avecVisuel.map((r) => r.key)).toEqual(['https://c.fr/filtre', 'https://c.fr/courroie'])
    const filtre = avecVisuel.find((r) => r.key === 'https://c.fr/filtre')!
    // 98 (code-barres déclaré) − 45 (démenti visuel) = 53 : plus « acquis », donc dans
    // la file de travail — c'est le fait qui compte, pas la nuance de bande.
    expect(filtre.confidence?.band).toBe('check')
    expect(filtre.confidence?.doubts).toContain('visual-conflict')
  })

  it('rend une liste vide sans catalogue source — tout serait orphelin', () => {
    expect(compileSite({ siteId: 's1', domain: 'c.fr' }, [], listings)).toEqual([])
  })
})

describe('rowDomain / rowSiteId', () => {
  it('préfèrent ce que la ligne porte, et retombent sur l’onglet sinon', () => {
    const [compiled] = compileSite({ siteId: 's1', domain: 'c.fr' }, products, listings, {})
    const plain = pairSiteListings(products, 's1', listings, {})[1]
    expect(rowDomain(compiled, 'onglet.fr')).toBe('c.fr')
    expect(rowSiteId(compiled, 'autre')).toBe('s1')
    expect(rowDomain(plain, 'onglet.fr')).toBe('onglet.fr')
    expect(rowSiteId(plain, 'autre')).toBe('autre')
  })
})

describe('compileBySite', () => {
  it('classe les concurrents par volume à contrôler', () => {
    const rows = [
      ...compileSite({ siteId: 'a', domain: 'a.fr' }, products, listings, {}),
      ...compileSite({ siteId: 'b', domain: 'b.fr' }, products, listings, {}),
      ...compileSite({ siteId: 'b', domain: 'b.fr' }, products, [listings[1]], {}),
    ]
    expect(compileBySite(rows)).toEqual([{ domain: 'b.fr', count: 2 }, { domain: 'a.fr', count: 1 }])
  })
})
