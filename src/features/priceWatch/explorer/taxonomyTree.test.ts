import { describe, it, expect } from 'vitest'
import { buildTaxoTree, isUnderPath } from './taxonomyTree'
import { filterRows, EMPTY_EXPLORER_FILTER } from './filters'
import { pairSiteListings } from './pairing'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/competitorListing'

const PATHS: Record<string, string[]> = {
  p1: ['Motoculture', 'Tondeuses', 'Courroies'],
  p2: ['Motoculture', 'Tondeuses', 'Lames'],
  p3: ['Motoculture', 'Tronçonneuses'],
  p4: ['Jardin'],
}

// Références assez longues pour ne pas être « faibles » (WEAK_REF_LEN = 5) : une réf
// courte n'est pas retenue comme preuve d'appariement, et rien ne se joindrait.
const products: SourceProduct[] = Object.keys(PATHS).map((id, i) => ({
  id, name: `Produit ${id}`, ref: `REF-100${i}`, price: 100,
}))
// ⚠ Le libellé reprend celui de la source : l'appariement EXIGE que le nom corrobore la
// référence (une réf n'est pas unique d'un fournisseur à l'autre). Une fiche « Fiche p1 »
// face à un produit « Produit p1 » ne se joindrait plus.
const listings: CompetitorListing[] = products.map((p, i) => ({
  url: `https://c.fr/${p.id}`, name: `Produit ${p.id} chez le concurrent`, ref: `REF-100${i}`, price: 120,
}))
// + une fiche que le concurrent est seul à vendre : elle n'a aucun chemin.
listings.push({ url: 'https://c.fr/orphan', name: 'Inconnu', ref: 'ZZZ', price: 50 })

const rows = pairSiteListings(products, 's1', listings, {
  vatRate: 0.2,
  extras: (p) => ({ description: null, url: null, images: [], path: PATHS[p.id] ?? [] }),
})
// L'arbre ne classe que des CHEMINS : c'est l'appelant qui dit d'où ils sortent.
const pathsOf = (rs: typeof rows) => rs.map((r) => r.source?.path ?? [])

describe('buildTaxoTree', () => {
  it('agrège les compteurs sur toute la branche, pas seulement sur la feuille', () => {
    const tree = buildTaxoTree(pathsOf(rows))
    const moto = tree.roots.find((n) => n.label === 'Motoculture')!
    expect(moto.count).toBe(3)
    const tondeuses = moto.children.find((n) => n.label === 'Tondeuses')!
    expect(tondeuses.count).toBe(2)
    expect(tondeuses.children.map((c) => c.label).sort()).toEqual(['Courroies', 'Lames'])
  })

  it('classe les nœuds par volume, pas alphabétiquement', () => {
    expect(buildTaxoTree(pathsOf(rows)).roots.map((n) => n.label)).toEqual(['Motoculture', 'Jardin'])
  })

  it('compte à part les fiches sans chemin plutôt que de les rattacher', () => {
    const tree = buildTaxoTree(pathsOf(rows))
    expect(tree.unclassified).toBe(1)
    expect(tree.total).toBe(5)
  })

  it('ne crée pas de nœud fantôme quand un niveau intermédiaire est vide', () => {
    const partial = pairSiteListings(products.slice(0, 1), 's1', listings.slice(0, 1), {
      // Sous-famille absente : le chemin doit s'arrêter à la famille.
      extras: () => ({ description: null, url: null, images: [], path: ['Motoculture'] }),
    })
    const tree = buildTaxoTree(pathsOf(partial))
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0].children).toEqual([])
  })
})

describe('filtre par chemin', () => {
  it('sélectionne par PRÉFIXE : une famille garde ses sous-familles', () => {
    const f = { ...EMPTY_EXPLORER_FILTER, path: ['Motoculture'] }
    expect(filterRows(rows, f)).toHaveLength(3)
    expect(filterRows(rows, { ...f, path: ['Motoculture', 'Tondeuses'] })).toHaveLength(2)
    expect(filterRows(rows, { ...f, path: ['Motoculture', 'Tondeuses', 'Lames'] })).toHaveLength(1)
  })

  it('écarte les fiches sans chemin dès qu’une famille est choisie', () => {
    const f = { ...EMPTY_EXPLORER_FILTER, pairing: 'all' as const, path: ['Jardin'] }
    expect(filterRows(rows, f).map((r) => r.source?.id)).toEqual(['p4'])
  })

  it('isUnderPath accepte le nœud lui-même et ses descendants', () => {
    expect(isUnderPath(['A', 'B'], ['A'])).toBe(true)
    expect(isUnderPath(['A', 'B'], ['A', 'B'])).toBe(true)
    expect(isUnderPath(['A'], ['A', 'B'])).toBe(false)
    expect(isUnderPath(['C'], ['A'])).toBe(false)
  })
})
