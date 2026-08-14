import { describe, it, expect } from 'vitest'
import { parseDashboard, DASHBOARD_VERSION } from './types'

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
