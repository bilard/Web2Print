import { describe, it, expect } from 'vitest'
import { pairSiteListings, discountPct } from './pairing'
import { buildReport } from '../catalog/report'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/prestashop'

const products: SourceProduct[] = [
  { id: 'p1', name: 'Courroie tondeuse', ref: 'ABC-123', ean: '4049582395377', price: 100 },
  { id: 'p2', name: 'Filtre à air', ref: 'XYZ-9', ean: '3701234567890', price: 50 },
  { id: 'p3', name: 'Bougie', ref: 'NOPE-1', ean: '3709999999998', price: 12 },
]

const listings: CompetitorListing[] = [
  { url: 'https://c.fr/courroie', name: 'Courroie ABC-123', ref: 'ABC-123', price: 108, listPrice: 135 },
  { url: 'https://c.fr/filtre', name: 'Filtre', gtin13: '3701234567890', price: 48, availability: 'out-of-stock' },
  { url: 'https://c.fr/inconnu', name: 'Article que je ne vends pas', ref: 'ZZZ-0', price: 30 },
]

describe('pairSiteListings', () => {
  it('apparie par référence et par EAN, et garde les fiches orphelines', () => {
    const rows = pairSiteListings(products, 's1', listings, { vatRate: 0.2 })
    expect(rows).toHaveLength(3)

    const courroie = rows.find((r) => r.key.endsWith('/courroie'))!
    expect(courroie.source?.id).toBe('p1')
    expect(courroie.kind).toBe('exact-ref')

    const filtre = rows.find((r) => r.key.endsWith('/filtre'))!
    expect(filtre.source?.id).toBe('p2')
    expect(filtre.kind).toBe('exact-ean')

    const orphan = rows.find((r) => r.key.endsWith('/inconnu'))!
    expect(orphan.source).toBeNull()
    expect(orphan.kind).toBeNull()
  })

  it('produit EXACTEMENT le même écart que le rapport du tableau de bord', () => {
    // Garde-fou central de l'écran : un écart qui contredirait le dashboard serait pire
    // que pas d'écran du tout. Même TVA, même bande d'alignement, mêmes fonctions.
    const opts = { vatRate: 0.2, alignedPct: 1 }
    const rows = pairSiteListings(products, 's1', listings, opts)
    const report = buildReport(products, [{ siteId: 's1', domain: 'c.fr' }], new Map([['s1', listings]]), opts)

    for (const row of rows) {
      if (!row.source) continue
      const cell = report.products
        .find((p) => p.id === row.source!.id)
        ?.competitors.find((c) => c.siteId === 's1')
      expect(cell, `produit ${row.source.id} absent du rapport`).toBeDefined()
      expect(row.cmp.deltaPct).toBe(cell!.gapPct)
      expect(row.cmp.priceHt).toBe(cell!.priceHt)
    }
  })

  it('joint description et visuels via les extras (base PIM)', () => {
    const rows = pairSiteListings(products, 's1', listings, {
      vatRate: 0.2,
      extras: (p) => (p.id === 'p1'
        ? { description: 'Courroie renforcée', url: null, images: ['https://f1/img.jpg'], path: ['Motoculture', 'Courroies'] }
        : { description: null, url: null, images: [], path: [] }),
    })
    const courroie = rows.find((r) => r.key.endsWith('/courroie'))!
    expect(courroie.source?.description).toBe('Courroie renforcée')
    expect(courroie.source?.images).toEqual(['https://f1/img.jpg'])
    expect(courroie.source?.path).toEqual(['Motoculture', 'Courroies'])
  })

  it('rend les fiches relevées même sans catalogue source (tout orphelin, prix conservés)', () => {
    // Cas réel : aucun « Comparer catalogue » abouti depuis le navigateur → `reportSource`
    // absent. L'écran doit montrer ce que le concurrent vend, pas rester vide.
    const rows = pairSiteListings([], 's1', listings, { vatRate: 0.2 })
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.source === null)).toBe(true)
    expect(rows[0].cmp.priceTtc).toBe(108)
    expect(rows[0].cmp.priceHt).toBe(90)
    expect(rows[0].cmp.deltaPct).toBeUndefined()
  })

  it('n’attribue pas deux fois la même fiche concurrente', () => {
    const dup: SourceProduct[] = [
      { id: 'a', name: 'A', ref: 'ABC-123', price: 100 },
      { id: 'b', name: 'B', ref: 'ABC123', price: 90 },
    ]
    const rows = pairSiteListings(dup, 's1', [listings[0]], { vatRate: 0.2 })
    expect(rows).toHaveLength(1)
    expect(rows[0].source?.id).toBe('a')
  })
})

describe('lien vers MA fiche produit', () => {
  // Le catalogue source (feuille du workflow) ne porte pas d'URL : sans gabarit, la
  // colonne de gauche restait la seule des deux à ne pas être cliquable.
  // La fiche concurrente reprend l'identité du produit testé, pour que l'appariement
  // aboutisse quelle que soit sa référence.
  const url = (tpl: string | undefined, p = products[0]) => {
    const l: CompetitorListing = { url: 'https://c.fr/x', name: 'X', ref: p.ref, gtin13: p.ean, price: 10 }
    return pairSiteListings([p], 's1', [l], { productUrl: tpl })[0].source?.url ?? null
  }

  it('remplace les jetons et ENCODE la valeur', () => {
    expect(url('https://f1.fr/p/{ref}')).toBe('https://f1.fr/p/ABC-123')
    expect(url('https://f1.fr/?ean={ean}')).toBe('https://f1.fr/?ean=4049582395377')
    // Une référence F1 porte des « / » (« 381600533/1 ») : insérée telle quelle, elle
    // fabriquerait un segment d'URL supplémentaire et un 404 muet.
    expect(url('https://f1.fr/p/{ref}', { id: 'x', name: 'X', ref: '381600533/1' }))
      .toBe('https://f1.fr/p/381600533%2F1')
  })

  it('traite une URL sans jeton comme un préfixe', () => {
    expect(url('https://f1.fr/p/')).toBe('https://f1.fr/p/ABC-123')
    expect(url('https://f1.fr/p')).toBe('https://f1.fr/p/ABC-123')
  })

  it('préfère aucun lien à un lien qui ment', () => {
    expect(url(undefined)).toBeNull()
    expect(url('')).toBeNull()
    expect(url('www.f1.fr/p/')).toBeNull()          // pas de schéma : pas une URL
    // Jeton sans valeur → l'URL tronquée mènerait à la page d'accueil.
    expect(url('https://f1.fr/p/{ean}', { id: 'x', name: 'X', ref: 'ABC-123' })).toBeNull()
  })

  it('ne recouvre jamais une URL déjà portée par le catalogue', () => {
    const p: SourceProduct = { ...products[0], url: 'https://f1.fr/vraie-fiche' }
    expect(url('https://f1.fr/p/{ref}', p)).toBe('https://f1.fr/vraie-fiche')
  })
})

describe('discountPct', () => {
  it('calcule la remise affichée, ignore les écarts nuls', () => {
    expect(discountPct(listings[0])).toBe(20)
    expect(discountPct(listings[1])).toBeNull()
    expect(discountPct({ url: 'u', name: 'n', price: 10, listPrice: 10.02 })).toBeNull()
  })
})
