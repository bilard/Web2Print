import { describe, it, expect } from 'vitest'
import { matchRows } from './matchRows'
import type { Product } from '../types'

const makeProduct = (id: string, sku: string | null): Product => ({
  _id: id,
  masterSku: sku,
  masterEan: null,
  primarySourceId: 'src_x',
  fields: {},
  sourceLinks: [],
  taxonomyPath: [],
  needsDedup: false,
  createdAt: 0,
  updatedAt: 0,
})

describe('matchRows', () => {
  it('preview vide = 0 nouveaux 0 mergés 0 needsDedup', () => {
    const preview = matchRows([], [])
    expect(preview.newMasters).toHaveLength(0)
    expect(preview.mergedOnExisting).toHaveLength(0)
    expect(preview.needsDedup).toHaveLength(0)
  })

  it('toutes les rows nouvelles si aucun match', () => {
    const rows = [{ sku: 'A1', name: 'a' }, { sku: 'B2', name: 'b' }]
    const preview = matchRows(rows, [])
    expect(preview.newMasters).toHaveLength(2)
    expect(preview.mergedOnExisting).toHaveLength(0)
  })

  it('match exact sur masterSku → mergé', () => {
    const products = [makeProduct('p1', 'a1')]
    const rows = [{ sku: 'A1', name: 'updated' }]
    const preview = matchRows(rows, products)
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.mergedOnExisting[0].targetProductId).toBe('p1')
  })

  it('row sans SKU → needsDedup', () => {
    const rows = [{ name: 'pack inconnu' }]
    const preview = matchRows(rows, [])
    expect(preview.needsDedup).toHaveLength(1)
    expect(preview.newMasters).toHaveLength(0)
  })

  it('collision intra-batch (même SKU 2 fois) → 1 merge dans newMasters', () => {
    const rows = [{ sku: 'A1', name: 'a' }, { sku: 'A1', name: 'a-bis' }]
    const preview = matchRows(rows, [])
    expect(preview.newMasters).toHaveLength(1)
    // La 2e row mergée avec la 1ère via batch index, pas via existing.
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.mergedOnExisting[0].targetProductId).toMatch(/^batch:/)
  })

  it('mix : 2 nouveaux, 1 mergé, 1 needsDedup', () => {
    const products = [makeProduct('p1', 'a1')]
    const rows = [
      { sku: 'A1', name: 'merge' },
      { sku: 'B2', name: 'new' },
      { sku: 'C3', name: 'new aussi' },
      { name: 'no sku' },
    ]
    const preview = matchRows(rows, products)
    expect(preview.mergedOnExisting).toHaveLength(1)
    expect(preview.newMasters).toHaveLength(2)
    expect(preview.needsDedup).toHaveLength(1)
  })
})
