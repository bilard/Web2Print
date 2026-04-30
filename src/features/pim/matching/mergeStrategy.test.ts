import { describe, it, expect } from 'vitest'
import { applyPreview, PER_SOURCE_FIELDS } from './mergeStrategy'
import type { Product } from '../types'
import { matchRows } from './matchRows'

const baseProduct = (over: Partial<Product> = {}): Product => ({
  _id: 'p1',
  masterSku: 'a1',
  masterEan: null,
  primarySourceId: 'src_a',
  fields: {},
  sourceLinks: [],
  taxonomyPath: [],
  needsDedup: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

describe('applyPreview', () => {
  it('crée des nouveaux masters depuis newMasters', () => {
    const rows = [{ sku: 'X1', name: 'Foo', price: 10 }]
    const preview = matchRows(rows, [])
    const result = applyPreview(preview, [], 'src_new', { now: 1000 })
    expect(result.products).toHaveLength(1)
    const p = result.products[0]
    expect(p.masterSku).toBe('x1')
    expect(p.primarySourceId).toBe('src_new')
    expect(p.fields.name?.value).toBe('Foo')
    // price reste dans le snapshot, pas dans fields master
    expect(p.fields.price).toBeUndefined()
    expect(p.sourceLinks[0].snapshot.price).toBe(10)
  })

  it('merge sur master existant : ajoute sourceLink, garde primarySource', () => {
    const existing = baseProduct({
      fields: { name: { value: 'Original', winningSourceId: 'src_a' } },
      sourceLinks: [{ sourceId: 'src_a', snapshot: { sku: 'A1', name: 'Original', price: 20 } }],
    })
    const rows = [{ sku: 'A1', name: 'Updated', price: 25 }]
    const preview = matchRows(rows, [existing])
    const result = applyPreview(preview, [existing], 'src_b', { now: 2000 })
    expect(result.products).toHaveLength(1)
    const p = result.products[0]
    expect(p.primarySourceId).toBe('src_a') // primary inchangé
    expect(p.fields.name?.value).toBe('Original') // nouveau ne gagne pas
    expect(p.sourceLinks).toHaveLength(2)
    expect(p.sourceLinks[1].snapshot.price).toBe(25)
  })

  it('field overridden résiste au merge', () => {
    const existing = baseProduct({
      fields: { name: { value: 'Verrouillé', winningSourceId: 'src_a', overridden: true } },
      sourceLinks: [{ sourceId: 'src_a', snapshot: { sku: 'A1', name: 'Verrouillé' } }],
    })
    const preview = matchRows([{ sku: 'A1', name: 'Tentative écrasement' }], [existing])
    const result = applyPreview(preview, [existing], 'src_b', { now: 3000 })
    expect(result.products[0].fields.name?.value).toBe('Verrouillé')
    expect(result.products[0].fields.name?.overridden).toBe(true)
  })

  it('PER_SOURCE_FIELDS ne sont jamais dans fields master', () => {
    expect(PER_SOURCE_FIELDS).toContain('price')
    expect(PER_SOURCE_FIELDS).toContain('image')
    expect(PER_SOURCE_FIELDS).toContain('stock')
    expect(PER_SOURCE_FIELDS).toContain('external_url')
  })

  it('row sans SKU → master synthétique avec needsDedup', () => {
    const rows = [{ name: 'no-sku-pack' }]
    const preview = matchRows(rows, [])
    const result = applyPreview(preview, [], 'src_x', { now: 4000 })
    expect(result.products).toHaveLength(1)
    expect(result.products[0].needsDedup).toBe(true)
    expect(result.products[0].masterSku).toBeNull()
  })
})
