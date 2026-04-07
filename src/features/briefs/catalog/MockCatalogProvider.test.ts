import { describe, it, expect, beforeEach } from 'vitest'
import { MockCatalogProvider } from './MockCatalogProvider'
import type { CatalogProduct } from './ProductCatalogProvider'

const sample: CatalogProduct[] = [
  {
    sku: 'A',
    name: 'Drapeau France',
    description: 'tricolore',
    price: 10,
    imageUrl: '',
    magentoCategoryIds: ['cat-drap'],
  },
  {
    sku: 'B',
    name: 'Mât 6m',
    description: 'aluminium',
    price: 100,
    imageUrl: '',
    magentoCategoryIds: ['cat-mat'],
  },
  {
    sku: 'C',
    name: 'Mât 8m',
    description: 'aluminium télescopique',
    price: 200,
    imageUrl: '',
    magentoCategoryIds: ['cat-mat'],
  },
]

describe('MockCatalogProvider', () => {
  let provider: MockCatalogProvider

  beforeEach(() => {
    provider = new MockCatalogProvider(sample)
  })

  describe('search', () => {
    it('returns all products when filter is empty', async () => {
      const result = await provider.search({})
      expect(result).toHaveLength(3)
    })

    it('filters by magentoCategoryIds (single match)', async () => {
      const result = await provider.search({ magentoCategoryIds: ['cat-drap'] })
      expect(result.map((p) => p.sku)).toEqual(['A'])
    })

    it('filters by magentoCategoryIds (multiple match)', async () => {
      const result = await provider.search({ magentoCategoryIds: ['cat-mat'] })
      expect(result.map((p) => p.sku).sort()).toEqual(['B', 'C'])
    })

    it('filters by query (case insensitive, in name)', async () => {
      const result = await provider.search({ query: 'drapeau' })
      expect(result.map((p) => p.sku)).toEqual(['A'])
    })

    it('filters by query (case insensitive, in description)', async () => {
      const result = await provider.search({ query: 'aluminium' })
      expect(result.map((p) => p.sku).sort()).toEqual(['B', 'C'])
    })

    it('combines filters with AND semantics', async () => {
      const result = await provider.search({
        magentoCategoryIds: ['cat-mat'],
        query: '8m',
      })
      expect(result.map((p) => p.sku)).toEqual(['C'])
    })

    it('respects the limit', async () => {
      const result = await provider.search({ limit: 2 })
      expect(result).toHaveLength(2)
    })

    it('returns empty when no match', async () => {
      const result = await provider.search({ query: 'inexistant' })
      expect(result).toEqual([])
    })

    it('ignores categoryNodeIds in MVP (mock has no node mapping)', async () => {
      const result = await provider.search({ categoryNodeIds: ['anything'] })
      expect(result).toHaveLength(3)
    })
  })

  describe('getBySku', () => {
    it('returns the matching product', async () => {
      const result = await provider.getBySku('B')
      expect(result?.name).toBe('Mât 6m')
    })

    it('returns null when sku not found', async () => {
      const result = await provider.getBySku('Z')
      expect(result).toBeNull()
    })
  })
})
