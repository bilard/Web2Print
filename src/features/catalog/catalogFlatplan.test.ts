import { describe, expect, it } from 'vitest'
import type { CatalogPageDescriptor, CatalogTreeNode, ProductSlot } from './catalogTypes'
import { paginateCatalog } from './catalogEngine'
import { applyPageOrder, buildSpreads, flatplanStats, nodePageRanges, pageKeysOf, universeColors } from './catalogFlatplan'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })
const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

/** Catalogue de référence : 2 univers → cover, toc, opener a, 2×products a, opener b, products b, back. */
function samplePages(): CatalogPageDescriptor[] {
  const tree = [
    node('a', 'Outillage', 1, ids(5, 'a')),
    node('b', 'Jardin', 1, [], [node('b/x', 'Tondeuses', 2, ids(2, 'b'))]),
  ]
  return paginateCatalog({ tree, sections: [{ nodeId: 'a', productsPerPage: 4, featuredIds: ['a2'] }, { nodeId: 'b', productsPerPage: 4, featuredIds: [] }] })
}

describe('pageKeysOf', () => {
  it('clés stables et uniques, produits numérotés par nœud dans l’ordre canonique', () => {
    const keys = pageKeysOf(samplePages())
    expect(keys).toEqual(['cover', 'toc:0', 'opener:a', 'products:a:0', 'products:a:1', 'opener:b', 'products:b:0', 'back-cover'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('applyPageOrder', () => {
  it('ordre vide = ordre du moteur (identité)', () => {
    const pages = samplePages()
    const { pages: out, keys } = applyPageOrder(pages, [])
    expect(out.map((p) => p.pageNumber)).toEqual(pages.map((p) => p.pageNumber))
    expect(keys).toEqual(pageKeysOf(pages))
  })

  it('réordonne le milieu, renumérote, et verrouille couverture/sommaire/4e', () => {
    const pages = samplePages()
    const order = ['cover', 'toc:0', 'opener:b', 'products:b:0', 'opener:a', 'products:a:0', 'products:a:1', 'back-cover']
    const { pages: out, keys } = applyPageOrder(pages, order)
    expect(keys).toEqual(order)
    expect(out.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(out[0].kind).toBe('cover')
    expect(out[out.length - 1].kind).toBe('back-cover')
    expect(out[2]).toMatchObject({ kind: 'opener', nodeId: 'b' })
  })

  it('même déplacé en tête, cover/toc/back-cover restent verrouillés', () => {
    const pages = samplePages()
    const order = ['back-cover', 'opener:b', 'products:b:0', 'cover', 'opener:a', 'products:a:0', 'products:a:1', 'toc:0']
    const { pages: out } = applyPageOrder(pages, order)
    expect(out[0].kind).toBe('cover')
    expect(out[1].kind).toBe('toc')
    expect(out[out.length - 1].kind).toBe('back-cover')
  })

  it('le sommaire est recalculé après réordonnancement', () => {
    const pages = samplePages()
    const order = ['opener:b', 'products:b:0', 'opener:a', 'products:a:0', 'products:a:1']
    const { pages: out } = applyPageOrder(pages, order)
    const toc = out.find((p) => p.kind === 'toc')
    if (toc?.kind !== 'toc') throw new Error('toc manquant')
    const byNode = new Map(toc.entries.map((e) => [e.nodeId, e.pageNumber]))
    expect(byNode.get('b')).toBe(3) // Jardin passé devant
    expect(byNode.get('a')).toBe(5)
    expect(byNode.get('b/x')).toBe(4) // sous-famille suivie via nodeIds de la page produits
  })

  it('clé inconnue (page apparue après le tri) : glissée après sa devancière connue', () => {
    const pages = samplePages()
    // L'ordre a été enregistré SANS products:a:1 (ex. densité changée depuis).
    const order = ['opener:b', 'products:b:0', 'opener:a', 'products:a:0']
    const { keys } = applyPageOrder(pages, order)
    const middle = keys.slice(2, -1)
    expect(middle).toEqual(['opener:b', 'products:b:0', 'opener:a', 'products:a:0', 'products:a:1'])
  })

  it('ne mute pas les pages du moteur (clones renumérotés)', () => {
    const pages = samplePages()
    const before = pages.map((p) => p.pageNumber)
    applyPageOrder(pages, ['opener:b', 'opener:a'])
    expect(pages.map((p) => p.pageNumber)).toEqual(before)
  })
})

describe('buildSpreads', () => {
  it('page 1 = recto seul, puis paires, dernière page seule en verso', () => {
    expect(buildSpreads(6)).toEqual([
      { index: 1, left: null, right: 0 },
      { index: 2, left: 1, right: 2 },
      { index: 3, left: 3, right: 4 },
      { index: 4, left: 5, right: null },
    ])
    expect(buildSpreads(0)).toEqual([])
  })
})

describe('stats & navigation', () => {
  it('flatplanStats : compte pages, planches, produits, vedettes, moyenne', () => {
    const s = flatplanStats(samplePages())
    expect(s).toMatchObject({ pages: 8, spreads: 5, productPages: 3, openers: 2, products: 7, featured: 1 })
    expect(s.avgPerPage).toBeCloseTo(2.3)
  })

  it('nodePageRanges : plage de pages par nœud (sous-familles incluses)', () => {
    const ranges = nodePageRanges(samplePages())
    expect(ranges.get('a')).toEqual({ first: 3, last: 5, pageCount: 3 })
    expect(ranges.get('b')).toEqual({ first: 6, last: 7, pageCount: 2 })
    expect(ranges.get('b/x')).toEqual({ first: 7, last: 7, pageCount: 1 })
  })

  it('universeColors : une couleur par univers, stable dans l’ordre d’apparition', () => {
    const colors = universeColors(samplePages())
    expect([...colors.keys()]).toEqual(['a', 'b'])
    expect(colors.get('a')).not.toBe(colors.get('b'))
  })

  it('flatplanStats sur page produits synthétique avec vedette', () => {
    const slot = (rowId: string, featured = false): ProductSlot => ({ rowId, featured, path: ['U'], col: 1, row: 1, colSpan: 1, rowSpan: 1 })
    const pages: CatalogPageDescriptor[] = [
      { kind: 'cover', pageNumber: 1 },
      { kind: 'products', pageNumber: 2, nodeId: 'u', breadcrumb: ['U'], grid: 4, slots: [slot('x', true), slot('y')] },
    ]
    expect(flatplanStats(pages)).toMatchObject({ products: 2, featured: 1, avgPerPage: 2 })
  })
})
