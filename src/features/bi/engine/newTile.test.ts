import { describe, it, expect } from 'vitest'
import { newTile, placeTile } from './newTile'
import { parseDashboard, DASHBOARD_VERSION } from '../types'

describe('nouvelle tuile', () => {
  it('produit une tuile VALIDE au sens du contrat', () => {
    const tile = newTile('bar', 'pim.products', 'count', 'taxo.1')
    const layout = placeTile([], tile.id, 'bar')
    expect(() => parseDashboard({
      id: 'd', name: 'n', accountId: 'a', workspaceUid: 'w',
      version: DASHBOARD_VERSION, createdAt: 1, updatedAt: 1, createdBy: 'u',
      tiles: [tile], layout, filters: [],
    })).not.toThrow()
  })

  it('une tuile KPI n’a PAS de dimension — sinon elle rendrait plusieurs lignes', () => {
    expect(newTile('kpi', 'pim.products', 'count', 'taxo.1').query.dimensions).toEqual([])
  })

  it('pose la tuile SOUS les existantes, jamais par-dessus', () => {
    const layout = placeTile([{ tileId: 'a', x: 0, y: 0, w: 6, h: 4 }], 'b', 'bar')
    expect(layout[1].y).toBeGreaterThanOrEqual(4)
  })

  it('donne à chaque type sa taille de départ utilisable', () => {
    expect(placeTile([], 'k', 'kpi')[0].w).toBeLessThan(placeTile([], 'p', 'pivot')[0].w)
  })
})
