import { describe, it, expect } from 'vitest'
import { newTile, placeTile } from './newTile'
import { parseDashboard, DASHBOARD_VERSION } from '../types'

describe('nouvelle tuile', () => {
  it('produit une tuile VALIDE au sens du contrat', () => {
    const tile = newTile('bar', 'pim.products', { id: 'count' }, 'taxo.1')
    const layout = placeTile([], tile.id, 'bar')
    expect(() => parseDashboard({
      id: 'd', name: 'n', accountId: 'a', workspaceUid: 'w',
      version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 1, createdBy: 'u',
      tiles: [tile], layout, filters: [],
    })).not.toThrow()
  })

  it('une tuile KPI n’a PAS de dimension — sinon elle rendrait plusieurs lignes', () => {
    expect(newTile('kpi', 'pim.products', { id: 'count' }, 'taxo.1').query.dimensions).toEqual([])
  })

  it('pose la tuile SOUS les existantes, jamais par-dessus', () => {
    const layout = placeTile([{ tileId: 'a', x: 0, y: 0, w: 6, h: 4 }], 'b', 'bar')
    expect(layout[1].y).toBeGreaterThanOrEqual(4)
  })

  // ⚠⚠ La mesure passe TELLE QUELLE : re-résolue contre le registre statique (qui ignore
  // les colonnes de la feuille active), toute mesure dérivée retombait sur « count ».
  it('conserve une mesure DÉRIVÉE d’une colonne, sans la ramener à une mesure déclarée', () => {
    const tile = newTile('bar', 'pim.products', { field: 'prix', agg: 'median' }, 'taxo.1')
    expect(tile.query.measures).toEqual([{ field: 'prix', agg: 'median' }])
  })

  it('donne à chaque type sa taille de départ utilisable', () => {
    expect(placeTile([], 'k', 'kpi')[0].w).toBeLessThan(placeTile([], 'p', 'pivot')[0].w)
  })
})

// ⚠⚠ Le tableau croisé était livré mais INATTEIGNABLE : la seule voie de création ne posait
// qu'une dimension, donc toute tuile « croisé » affichait « demande deux dimensions ».
describe('tuile tableau croisé', () => {
  it('pose les DEUX axes et désigne explicitement la colonne', () => {
    const tile = newTile('pivot', 'pim.products', { id: 'count' }, 'taxo.1', 'taxo.2')
    expect(tile.query.dimensions.map((d) => d.id)).toEqual(['taxo.1', 'taxo.2'])
    expect(tile.options?.pivotColumn).toBe('taxo.2')
  })

  it('ignore une colonne identique à l’axe des lignes — un axe ne se croise pas avec lui-même', () => {
    const tile = newTile('pivot', 'pim.products', { id: 'count' }, 'taxo.1', 'taxo.1')
    expect(tile.query.dimensions).toHaveLength(1)
    expect(tile.options?.pivotColumn).toBeUndefined()
  })

  it('n’ajoute pas de second axe aux autres types de visuel', () => {
    expect(newTile('bar', 'pim.products', { id: 'count' }, 'taxo.1', 'taxo.2').query.dimensions).toHaveLength(1)
  })
})
