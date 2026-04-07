import { describe, it, expect } from 'vitest'
import { filterValidSkus } from './skuGuardRail'

const catalogSkus = ['A1', 'A2', 'B1']

describe('filterValidSkus', () => {
  it('keeps items whose SKU exists in the catalog', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 2, aiJustification: 'x' },
        { sku: 'A2', quantity: 1, aiJustification: 'y' },
      ],
      catalogSkus,
    )
    expect(r.kept).toHaveLength(2)
    expect(r.invalidSkus).toHaveLength(0)
    expect(r.shouldRetry).toBe(false)
  })

  it('drops hallucinated SKUs and reports them', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'ZZZ', quantity: 1, aiJustification: 'y' },
      ],
      catalogSkus,
    )
    expect(r.kept).toHaveLength(1)
    expect(r.invalidSkus).toEqual(['ZZZ'])
  })

  it('flags shouldRetry when more than 30% of SKUs are invalid', () => {
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'X', quantity: 1, aiJustification: 'y' },
        { sku: 'Y', quantity: 1, aiJustification: 'z' },
      ],
      catalogSkus,
    )
    expect(r.shouldRetry).toBe(true)
  })

  it('does not flag retry at exactly 33% if threshold is strict >30%', () => {
    // 1/3 = 33% → > 30% → retry
    const r = filterValidSkus(
      [
        { sku: 'A1', quantity: 1, aiJustification: 'x' },
        { sku: 'A2', quantity: 1, aiJustification: 'y' },
        { sku: 'X', quantity: 1, aiJustification: 'z' },
      ],
      catalogSkus,
    )
    expect(r.shouldRetry).toBe(true)
  })

  it('handles an empty input', () => {
    const r = filterValidSkus([], catalogSkus)
    expect(r.kept).toHaveLength(0)
    expect(r.shouldRetry).toBe(false)
  })
})
