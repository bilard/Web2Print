import { describe, it, expect } from 'vitest'
import {
  parseDashboard, DASHBOARD_VERSION, isDerivedMeasure, measureKey,
  FIRST_PAGE_ID, replacePage, appendPage,
} from './types'

const minimal = {
  id: 'd1', name: 'Complétude', accountId: 'acme', workspaceUid: 'u1',
  version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 2, createdBy: 'u1',
  tiles: [{
    id: 't1', kind: 'kpi', title: 'Produits',
    query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
  }],
  layout: [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }],
  filters: [],
}

describe('parseDashboard', () => {
  it('accepte un tableau de bord minimal et complète les champs optionnels', () => {
    const d = parseDashboard(minimal)
    expect(d.tiles[0].query.limit).toBeUndefined()
    expect(d.filters).toEqual([])
  })

  it('REFUSE une source inconnue — une spec non validée n’atteint jamais le moteur', () => {
    const bad = { ...minimal, tiles: [{ ...minimal.tiles[0], query: { ...minimal.tiles[0].query, source: 'sql.libre' } }] }
    expect(() => parseDashboard(bad)).toThrow()
  })

  it('REFUSE une tuile absente de la mise en page — une tuile invisible est une donnée perdue', () => {
    expect(() => parseDashboard({ ...minimal, layout: [] })).toThrow(/mise en page/i)
  })

  it('REFUSE un opérateur de filtre inventé', () => {
    const bad = { ...minimal, filters: [{ field: 'brand', op: 'ressemble', value: 'x' }] }
    expect(() => parseDashboard(bad)).toThrow()
  })
})

// ⚠⚠ Les deux formes de mesure coexistent : les tableaux ENREGISTRÉS ne portent que `{ id }`,
// et les écarter les rendrait illisibles d'un coup.
describe('mesures déclarées et dérivées', () => {
  const withMeasures = (measures: unknown[]) => ({
    ...minimal,
    tiles: [{ ...minimal.tiles[0], query: { ...minimal.tiles[0].query, measures } }],
  })

  it('accepte une mesure DÉCLARÉE — la forme de tous les tableaux déjà en base', () => {
    const d = parseDashboard(minimal)
    expect(d.tiles[0].query.measures[0]).toEqual({ id: 'count' })
    expect(measureKey(d.tiles[0].query.measures[0])).toBe('count')
  })

  it('accepte une mesure DÉRIVÉE d’une colonne', () => {
    const d = parseDashboard(withMeasures([{ field: 'prix', agg: 'median' }]))
    const ref = d.tiles[0].query.measures[0]
    expect(isDerivedMeasure(ref)).toBe(true)
    expect(measureKey(ref)).toBe('median:prix')
  })

  it('un tri enregistré sur la clé d’une mesure déclarée reste valide', () => {
    const spec = {
      ...minimal.tiles[0].query, measures: [{ id: 'count' }],
      sort: [{ by: 'count', dir: 'desc' }],
    }
    const d = parseDashboard({ ...minimal, tiles: [{ ...minimal.tiles[0], query: spec }] })
    expect(d.tiles[0].query.sort?.[0].by).toBe('count')
  })

  it('l’alias prime sur la clé, quelle que soit la forme', () => {
    expect(measureKey({ id: 'count', alias: 'n' })).toBe('n')
    expect(measureKey({ field: 'prix', agg: 'sum', alias: 'ca' })).toBe('ca')
  })

  it('REFUSE une agrégation inventée', () => {
    expect(() => parseDashboard(withMeasures([{ field: 'prix', agg: 'ecartType' }]))).toThrow()
  })

  it('REFUSE une mesure sans identifiant ni colonne', () => {
    expect(() => parseDashboard(withMeasures([{ agg: 'sum' }]))).toThrow()
  })
})

// ⚠⚠ Un tableau de bord porte désormais PLUSIEURS pages. Les documents déjà en base n'en
// portent aucune (`tiles` + `layout` à la racine) : ils doivent continuer de se lire, et se
// présenter comme une page unique. C'est la condition pour que la migration n'efface rien.
describe('pages', () => {
  it('un document ANCIEN, sans pages, se lit comme une page unique', () => {
    const d = parseDashboard(minimal)
    expect(d.pages).toHaveLength(1)
    expect(d.pages[0].id).toBe(FIRST_PAGE_ID)
    expect(d.pages[0].tiles).toEqual(d.tiles)
    expect(d.pages[0].layout).toEqual(d.layout)
  })

  it('la page unique d’un document ancien porte le NOM du tableau de bord', () => {
    expect(parseDashboard(minimal).pages[0].name).toBe('Complétude')
  })

  it('un document ancien garde son orphelin INTERDIT — la garde suit la page', () => {
    expect(() => parseDashboard({ ...minimal, layout: [] })).toThrow(/mise en page/i)
  })

  const twoPages = {
    ...minimal,
    pages: [
      { id: 'p1', name: 'Écarts', tiles: minimal.tiles, layout: minimal.layout },
      { id: 'p2', name: 'Couverture', tiles: [], layout: [] },
    ],
  }

  it('accepte plusieurs pages, chacune avec ses tuiles et sa mise en page', () => {
    const d = parseDashboard(twoPages)
    expect(d.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(d.pages[1].tiles).toEqual([])
  })

  it('la racine reflète la PREMIÈRE page — un onglet resté sur l’ancien code lit encore', () => {
    const d = parseDashboard({ ...twoPages, tiles: [], layout: [] })
    expect(d.tiles).toEqual(d.pages[0].tiles)
    expect(d.layout).toEqual(d.pages[0].layout)
  })

  it('REFUSE une tuile orpheline sur une page NON PREMIÈRE — aucune page n’échappe à la garde', () => {
    const bad = {
      ...twoPages,
      pages: [twoPages.pages[0], { id: 'p2', name: 'Couverture', tiles: minimal.tiles, layout: [] }],
    }
    expect(() => parseDashboard(bad)).toThrow(/mise en page/i)
  })

  it('REFUSE deux pages de même identifiant — l’onglet actif deviendrait ambigu', () => {
    const bad = { ...twoPages, pages: [twoPages.pages[0], { ...twoPages.pages[1], id: 'p1' }] }
    expect(() => parseDashboard(bad)).toThrow(/identifiant/i)
  })

  it('REFUSE une liste de pages VIDE — un tableau sans page n’a rien à montrer', () => {
    expect(() => parseDashboard({ ...twoPages, pages: [] })).toThrow()
  })
})

describe('replacePage / appendPage', () => {
  const d = parseDashboard(minimal)

  it('replacePage ne touche QUE la page visée, et remet la racine en miroir', () => {
    const next = replacePage(d, FIRST_PAGE_ID, { tiles: [], layout: [] })
    expect(next.pages[0].tiles).toEqual([])
    expect(next.tiles).toEqual([])
    expect(next.pages[0].name).toBe('Complétude')
  })

  it('replacePage sur une page inconnue laisse le tableau INTACT', () => {
    expect(replacePage(d, 'fantôme', { tiles: [] })).toEqual(d)
  })

  it('appendPage ajoute une page VIDE en fin, sans toucher aux précédentes', () => {
    const next = appendPage(d, 'Couverture')
    expect(next.pages).toHaveLength(2)
    expect(next.pages[1].name).toBe('Couverture')
    expect(next.pages[1].tiles).toEqual([])
    expect(next.pages[0]).toEqual(d.pages[0])
    // La page ajoutée doit passer la validation : sinon elle serait refusée à l'écriture.
    expect(() => parseDashboard(next)).not.toThrow()
  })

  it('appendPage donne un identifiant NEUF — jamais celui d’une page existante', () => {
    const next = appendPage(appendPage(d, 'A'), 'B')
    expect(new Set(next.pages.map((p) => p.id)).size).toBe(3)
  })
})

// ⚠ `sourceSheetName` est OPTIONNEL, et doit le rester : les tableaux de bord enregistrés
// avant son introduction ne le portent pas, et un champ requis les rendrait tous illisibles.
describe('feuille source mémorisée', () => {
  it('accepte un tableau ANTÉRIEUR, dépourvu du champ', () => {
    expect(() => parseDashboard(minimal)).not.toThrow()
  })

  it('conserve le nom de la feuille quand il est présent', () => {
    expect(parseDashboard({ ...minimal, sourceSheetName: 'Catalogue 2026' }).sourceSheetName)
      .toBe('Catalogue 2026')
  })
})
