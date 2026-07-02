import { describe, expect, it } from 'vitest'
import type { CatalogSectionPlan, CatalogTreeNode } from './catalogTypes'
import { DEFAULT_GRID, TOC_ENTRIES_PER_PAGE, paginateCatalog } from './catalogEngine'

const node = (id: string, label: string, level: 1 | 2 | 3, productIds: string[] = [], children: CatalogTreeNode[] = []): CatalogTreeNode =>
  ({ id, label, level, children, productIds })
const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
const sec = (nodeId: string, productsPerPage: CatalogSectionPlan['productsPerPage'], featuredIds: string[] = []): CatalogSectionPlan =>
  ({ nodeId, productsPerPage, featuredIds })

describe('paginateCatalog (flux continu par univers)', () => {
  it('séquence complète : couverture, sommaire, ouverture, produits, 4e de couverture', () => {
    const tree = [node('a', 'Outillage', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)] })
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'toc', 'opener', 'products', 'products', 'back-cover'])
    expect(pages.map((p) => p.pageNumber)).toEqual([1, 2, 3, 4, 5, 6])
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots).toHaveLength(4)
    expect(grids[1].slots).toHaveLength(1)
  })

  it('grille par défaut = 4 si aucune section ne matche', () => {
    const pages = paginateCatalog({ tree: [node('a', 'A', 1, ids(DEFAULT_GRID))], sections: [] })
    expect(pages.filter((p) => p.kind === 'products')).toHaveLength(1)
  })

  it("la grille de l'UNIVERS s'applique à tout son flux (sous-familles incluses)", () => {
    const tree = [node('a', 'A', 1, [], [node('a/b', 'B', 2, ids(4))])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 2)] })
    expect(pages.filter((p) => p.kind === 'products')).toHaveLength(2) // 4 produits / grille 2
  })

  it('flux continu SANS vide : les sous-familles s’enchaînent sur la même page, chaque slot porte son path', () => {
    const tree = [node('a', 'Outillage', 1, [], [
      node('a/b', 'Perceuses', 2, ids(1, 'x')),
      node('a/c', 'Scies', 2, ids(1, 'y')),
      node('a/d', 'Marteaux', 2, ids(1, 'z')),
    ])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids).toHaveLength(1) // 3 produits sur UNE page de 4 — pas une page par sous-famille
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['x1', 'y1', 'z1'])
    expect(grids[0].slots.map((s) => s.path[s.path.length - 1])).toEqual(['Perceuses', 'Scies', 'Marteaux'])
    expect(grids[0].breadcrumb).toEqual(['Outillage', 'Perceuses']) // univers › famille du 1er slot
  })

  it('vedette = pleine page (grille 1), regroupée en tête d’univers, retirée du flux', () => {
    const tree = [node('a', 'A', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4, ['p3'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].grid).toBe(1)
    expect(grids[0].slots).toEqual([{ rowId: 'p3', featured: true, path: ['A'] }])
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p1', 'p2', 'p4', 'p5'])
  })

  it('vedette d’une sous-famille : path complet, page émise avant le flux de l’univers', () => {
    const tree = [node('a', 'A', 1, ids(2), [node('a/b', 'B', 2, ids(2, 'x'))])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4), sec('a/b', 4, ['x2'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].grid).toBe(1)
    expect(grids[0].slots[0]).toEqual({ rowId: 'x2', featured: true, path: ['A', 'B'] })
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p1', 'p2', 'x1'])
  })

  it('univers vide (aucun produit dans le sous-arbre) → ni ouverture ni entrée sommaire', () => {
    const tree = [node('a', 'A', 1, ids(1)), node('b', 'B', 1, [], [node('b/c', 'C', 2)])]
    const pages = paginateCatalog({ tree, sections: [] })
    expect(pages.filter((p) => p.kind === 'opener')).toHaveLength(1)
    const toc = pages.find((p) => p.kind === 'toc')!
    expect(toc.entries.map((e) => e.nodeId)).toEqual(['a'])
  })

  it('sommaire (passe 2) : univers → ouverture, nœud → première page contenant un de ses produits', () => {
    const tree = [
      node('a', 'A', 1, ids(4, 'a')),
      node('b', 'B', 1, [], [node('b/c', 'C', 2, ids(1, 'c'))]),
    ]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)] })
    // 1 cover, 2 toc, 3 opener A, 4 produits A, 5 opener B, 6 produits (flux B → c1), 7 back
    const toc = pages.find((p) => p.kind === 'toc')!
    expect(toc.entries).toEqual([
      { nodeId: 'a', label: 'A', level: 1, pageNumber: 3 },
      { nodeId: 'b', label: 'B', level: 1, pageNumber: 5 },
      { nodeId: 'b/c', label: 'C', level: 2, pageNumber: 6 },
    ])
  })

  it('plus de 24 entrées → 2 pages de sommaire, numérotation décalée', () => {
    const tree = Array.from({ length: 30 }, (_, i) => node(`u${i}`, `U${i}`, 1 as const, [`p${i}`]))
    const pages = paginateCatalog({ tree, sections: [] })
    const tocs = pages.filter((p) => p.kind === 'toc')
    expect(tocs).toHaveLength(2)
    expect(tocs[0].entries).toHaveLength(TOC_ENTRIES_PER_PAGE)
    expect(tocs[1].entries).toHaveLength(30 - TOC_ENTRIES_PER_PAGE)
    expect(pages.find((p) => p.kind === 'opener')!.pageNumber).toBe(4)
  })

  it('catalogue vide → cover, toc vide, back-cover', () => {
    const pages = paginateCatalog({ tree: [], sections: [] })
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'toc', 'back-cover'])
  })
})
