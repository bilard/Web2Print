import { describe, it, expect } from 'vitest'
import { pimProductsToSheet } from './productToSheet'
import type { Product, Source } from './types'

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

describe('pimProductsToSheet', () => {
  it('renvoie une sheet vide si pas de produits', () => {
    const sheet = pimProductsToSheet([], [])
    expect(sheet.rows).toHaveLength(0)
    expect(sheet.columns).toHaveLength(0)
    expect(sheet.name).toBe('Produits')
  })

  it('priorise sku/ean/name en tête des colonnes', () => {
    const products = [
      baseProduct({
        fields: {
          random: { value: 'x', winningSourceId: 'src_a' },
          name: { value: 'Foo', winningSourceId: 'src_a' },
          sku: { value: 'a1', winningSourceId: 'src_a' },
        },
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    const keys = sheet.columns.map((c) => c.key)
    expect(keys.indexOf('sku')).toBeLessThan(keys.indexOf('name'))
    expect(keys.indexOf('name')).toBeLessThan(keys.indexOf('random'))
  })

  it('marque sku/ean comme isPrimary', () => {
    const products = [
      baseProduct({
        fields: {
          sku: { value: 'a1', winningSourceId: 'src_a' },
          ean: { value: '123', winningSourceId: 'src_a' },
          name: { value: 'Foo', winningSourceId: 'src_a' },
        },
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    const skuCol = sheet.columns.find((c) => c.key === 'sku')
    const eanCol = sheet.columns.find((c) => c.key === 'ean')
    const nameCol = sheet.columns.find((c) => c.key === 'name')
    expect(skuCol?.isPrimary).toBe(true)
    expect(eanCol?.isPrimary).toBe(true)
    expect(nameCol?.isPrimary).toBe(false)
  })

  it('utilise la valeur master si présente', () => {
    const products = [
      baseProduct({
        fields: { name: { value: 'Master Name', winningSourceId: 'src_a' } },
        sourceLinks: [{ sourceId: 'src_a', snapshot: { name: 'Snapshot Name' } }],
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    expect(sheet.rows[0].name).toBe('Master Name')
  })

  it('fallback sur le snapshot du primarySource pour les colonnes per-source', () => {
    const products = [
      baseProduct({
        primarySourceId: 'src_a',
        fields: { name: { value: 'Foo', winningSourceId: 'src_a' } },
        sourceLinks: [
          { sourceId: 'src_a', snapshot: { price: 24.9 } },
          { sourceId: 'src_b', snapshot: { price: 26.5 } },
        ],
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    expect(sheet.rows[0].price).toBe(24.9)  // primary wins
  })

  it('fallback sur le 1er link si primarySource absent des links', () => {
    const products = [
      baseProduct({
        primarySourceId: 'src_a',
        fields: {},
        sourceLinks: [
          { sourceId: 'src_b', snapshot: { name: 'B', price: 30 } },
          { sourceId: 'src_c', snapshot: { name: 'C', price: 35 } },
        ],
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    expect(sheet.rows[0].price).toBe(30)
  })

  it('cellule null si la clé n\'existe ni dans fields ni dans snapshots', () => {
    const products = [
      baseProduct({
        fields: { name: { value: 'A', winningSourceId: 'src_a' } },
        sourceLinks: [{ sourceId: 'src_a', snapshot: { name: 'A' } }],
      }),
      baseProduct({
        _id: 'p2',
        fields: { name: { value: 'B', winningSourceId: 'src_b' }, color: { value: 'red', winningSourceId: 'src_b' } },
        sourceLinks: [{ sourceId: 'src_b', snapshot: { name: 'B', color: 'red' } }],
      }),
    ]
    const sheet = pimProductsToSheet(products, [])
    // p1 n'a pas color → null
    expect(sheet.rows[0].color).toBeNull()
    expect(sheet.rows[1].color).toBe('red')
  })

  it('chaque row a un _id repris du Product', () => {
    const products = [
      baseProduct({ _id: 'prod_x' }),
      baseProduct({ _id: 'prod_y' }),
    ]
    const sheet = pimProductsToSheet(products, [])
    expect(sheet.rows.map((r) => r._id)).toEqual(['prod_x', 'prod_y'])
  })

  it('accepte un nom de sheet personnalisé', () => {
    const sheet = pimProductsToSheet([], [], 'Catalog 2026')
    expect(sheet.name).toBe('Catalog 2026')
  })
})

// Type bypass pour Source (non utilisé dans les tests mais signature exige)
const _unused: Source[] = []
void _unused
