import { describe, it, expect } from 'vitest'
import { computeSubtotal, applyDiscount, computeTotal } from './cartMath'
import type { CartItem, CartDiscount } from '@/features/briefs/types'

function item(overrides: Partial<CartItem>): CartItem {
  return {
    sku: 'X',
    name: 'X',
    categoryNodeId: 'n1',
    quantity: 1,
    unitPrice: 10,
    source: 'manual',
    ...overrides,
  }
}

describe('computeSubtotal', () => {
  it('returns 0 for an empty cart', () => {
    expect(computeSubtotal([])).toBe(0)
  })
  it('sums unitPrice * quantity', () => {
    expect(
      computeSubtotal([item({ unitPrice: 10, quantity: 2 }), item({ unitPrice: 5, quantity: 3 })]),
    ).toBe(35)
  })
  it('uses unitPriceOverride when provided', () => {
    expect(
      computeSubtotal([item({ unitPrice: 10, unitPriceOverride: 8, quantity: 2 })]),
    ).toBe(16)
  })
  it('treats missing prices as 0', () => {
    expect(computeSubtotal([item({ unitPrice: undefined, quantity: 2 })])).toBe(0)
  })
})

describe('applyDiscount', () => {
  it('returns the subtotal when no discount', () => {
    expect(applyDiscount(100, undefined)).toBe(100)
  })
  it('applies a percent discount', () => {
    const d: CartDiscount = { type: 'percent', value: 10 }
    expect(applyDiscount(100, d)).toBe(90)
  })
  it('applies an amount discount', () => {
    const d: CartDiscount = { type: 'amount', value: 15 }
    expect(applyDiscount(100, d)).toBe(85)
  })
  it('clamps the result at 0 if discount > subtotal', () => {
    expect(applyDiscount(10, { type: 'amount', value: 50 })).toBe(0)
  })
  it('clamps percent discount above 100%', () => {
    expect(applyDiscount(100, { type: 'percent', value: 150 })).toBe(0)
  })
})

describe('computeTotal', () => {
  it('combines subtotal and discount', () => {
    const items = [item({ unitPrice: 50, quantity: 2 })] // subtotal = 100
    expect(computeTotal(items, { type: 'percent', value: 20 })).toBe(80)
  })
})
