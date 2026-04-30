import { describe, it, expect } from 'vitest'
import { migrateLegacyBdd } from './migrateLegacyBdd'
import { makeLegacyDoc, sampleSheets } from './legacyFixture'

describe('migrateLegacyBdd', () => {
  it('crée 1 projet + N sources depuis N sheets', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.project.id).toBe('legacy_abc')
    expect(result.project.name).toBe('Castorama')
    expect(result.project.path).toEqual(['Distribution'])
    expect(result.project.sources).toHaveLength(2)
    expect(result.project.sources[0].name).toBe('nicoll.fr')
    expect(result.project.sources[0].kind).toBe('scrape')
  })

  it('SKU partagé entre sheets → 1 produit master avec 2 sourceLinks', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    const shared = result.products.find((p) => p.masterSku === 'nic001')
    expect(shared).toBeDefined()
    expect(shared!.sourceLinks).toHaveLength(2)
  })

  it('total products = 3 (NIC-001 unique, NIC-002, MIL-4933)', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.products).toHaveLength(3)
  })

  it('row sans SKU → needsDedup', () => {
    const noSkuSheets = [{ ...sampleSheets[0], rows: [{ _id: 'x', name: 'orphan', price: 10 }] }]
    const result = migrateLegacyBdd(makeLegacyDoc(noSkuSheets), { now: 1000 })
    expect(result.products[0].needsDedup).toBe(true)
  })

  it('totaux dryRun stats valides', () => {
    const result = migrateLegacyBdd(makeLegacyDoc(sampleSheets), { now: 1000 })
    expect(result.stats.sourcesCreated).toBe(2)
    expect(result.stats.productsCreated).toBe(3)
    expect(result.stats.rowsMerged).toBe(1)
  })
})
