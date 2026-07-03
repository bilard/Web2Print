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

  it('vedette JAMAIS pleine page tant qu’il reste du flux : grande carte 2×1 sur grille 4, entourée de produits', () => {
    const tree = [node('a', 'A', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4, ['p3'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].grid).toBe(4)
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['p3', 'p1', 'p2']) // vedette + 2 produits sur la MÊME page
    expect(grids[0].slots[0]).toMatchObject({ featured: true, col: 1, row: 1, colSpan: 2, rowSpan: 1 })
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p4', 'p5'])
  })

  it('1 vedette MAX par page : deux vedettes réparties sur deux pages', () => {
    const tree = [node('a', 'A', 1, ids(6))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 6, ['p1', 'p2'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids.map((g) => g.slots.filter((s) => s.featured).length)).toEqual([1, 1])
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['p1', 'p3', 'p4'])
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p2', 'p5', 'p6'])
  })

  it('vedette restante SANS flux à mixer → pleine page', () => {
    const tree = [node('a', 'A', 1, ['p1'])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4, ['p1'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots).toEqual([{ rowId: 'p1', featured: true, path: ['A'], col: 1, row: 1, colSpan: 2, rowSpan: 2 }])
  })

  it('vedette PARTAGE la page avec d’autres produits quand la grille le permet (6/page)', () => {
    const tree = [node('a', 'A', 1, ids(5))]
    const pages = paginateCatalog({ tree, sections: [sec('a', 6, ['p1'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['p1', 'p2', 'p3']) // 2×2 + 2 fiches 1×1 = grille 2×3 pleine
    expect(grids[0].slots[0]).toMatchObject({ featured: true, colSpan: 2, rowSpan: 2 })
    expect(grids[0].slots.slice(1).every((s) => s.colSpan === 1 && s.rowSpan === 1 && s.row === 3)).toBe(true)
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['p4', 'p5'])
  })

  it('vedette d’une sous-famille : path complet, mixée en tête de la 1re page de l’univers', () => {
    const tree = [node('a', 'A', 1, ids(2), [node('a/b', 'B', 2, ids(2, 'x'))])]
    const pages = paginateCatalog({ tree, sections: [sec('a', 4), sec('a/b', 4, ['x2'])] })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots[0]).toMatchObject({ rowId: 'x2', featured: true, path: ['A', 'B'], colSpan: 2, rowSpan: 1 })
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['x2', 'p1', 'p2'])
    expect(grids[1].slots.map((s) => s.rowId)).toEqual(['x1'])
  })

  it('sizeByPrice : la carte > P80 est plafonnée (jamais pleine page) sur grille 4', () => {
    const tree = [node('a', 'A', 1, ids(4))]
    const prices = new Map<string, number | null>([['p1', 100], ['p2', 10], ['p3', 10], ['p4', 10]])
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)], sizeByPrice: true, prices })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids[0].slots[0]).toMatchObject({ rowId: 'p1', colSpan: 2, rowSpan: 1 }) // 2×2 plafonné → 2×1
    expect(grids[0].slots.map((s) => s.rowId)).toEqual(['p1', 'p2', 'p3'])
  })

  it('sizeByPrice : prix > P80 → carte 2×2, prix > médiane → carte élargie 2×1', () => {
    const tree = [node('a', 'A', 1, ids(4))]
    const prices = new Map<string, number | null>([['p1', 10], ['p2', 10], ['p3', 50], ['p4', 100]])
    const pages = paginateCatalog({ tree, sections: [sec('a', 8)], sizeByPrice: true, prices })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids).toHaveLength(1) // 1+1+2+4 = 8 unités = une grille 2×4 pleine
    const byId = new Map(grids[0].slots.map((s) => [s.rowId, s]))
    expect(byId.get('p1')).toMatchObject({ colSpan: 1, rowSpan: 1 })
    expect(byId.get('p3')).toMatchObject({ colSpan: 2, rowSpan: 1 }) // > médiane
    expect(byId.get('p4')).toMatchObject({ colSpan: 2, rowSpan: 2 }) // > P80
  })

  it('sizeByPrice : span dégradé (jamais de débordement), prix identiques → aucune carte agrandie', () => {
    const tree = [node('a', 'A', 1, ids(4))]
    const same = new Map<string, number | null>(ids(4).map((id) => [id, 25]))
    const pages = paginateCatalog({ tree, sections: [sec('a', 4)], sizeByPrice: true, prices: same })
    const grids = pages.filter((p) => p.kind === 'products')
    expect(grids).toHaveLength(1)
    expect(grids[0].slots.every((s) => s.colSpan === 1 && s.rowSpan === 1)).toBe(true)
  })

  it('densité aléatoire : déterministe (même entrée → mêmes pages), grilles dans le pool', () => {
    const tree = [node('a', 'A', 1, ids(30))]
    const sections = [{ ...sec('a', 4), randomDensity: true }]
    const run1 = paginateCatalog({ tree, sections })
    const run2 = paginateCatalog({ tree, sections })
    expect(run1).toEqual(run2)
    const grids = run1.filter((p) => p.kind === 'products')
    expect(grids.length).toBeGreaterThan(1)
    expect(new Set(grids.map((g) => g.grid)).size).toBeGreaterThan(1) // densité réellement variée
    expect(grids.flatMap((g) => g.slots).map((s) => s.rowId)).toEqual(ids(30)) // aucun produit perdu
  })

  it('ouverture d’univers : index, compteur et familles (avec sous-familles non vides)', () => {
    const tree = [
      node('a', 'A', 1, ids(1)),
      node('b', 'B', 1, [], [
        node('b/c', 'C', 2, ids(2, 'c'), [node('b/c/d', 'D', 3, ids(1, 'd')), node('b/c/e', 'E', 3)]),
      ]),
    ]
    const pages = paginateCatalog({ tree, sections: [] })
    const openers = pages.filter((p) => p.kind === 'opener')
    expect(openers[0]).toMatchObject({ label: 'A', index: 1, productCount: 1, families: [] })
    expect(openers[1]).toMatchObject({
      label: 'B', index: 2, productCount: 3,
      families: [{ label: 'C', count: 3, subs: ['D'] }], // E est vide → absente
    })
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
