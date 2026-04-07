import { describe, it, expect } from 'vitest'
import { cartItemsToCsv } from './cartCsv'
import type { CartItem } from '@/features/briefs/types'

const item = (o: Partial<CartItem> = {}): CartItem => ({
  sku: 'A1',
  name: 'Produit A',
  categoryNodeId: 'n1',
  quantity: 2,
  unitPrice: 10,
  source: 'ai',
  ...o,
})

describe('cartItemsToCsv', () => {
  it('outputs a header row first', () => {
    const csv = cartItemsToCsv([item()])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('SKU,Nom,Quantité,Prix unitaire,Prix appliqué,Total ligne')
  })

  it('uses unitPriceOverride for "prix appliqué" when set', () => {
    const csv = cartItemsToCsv([item({ unitPriceOverride: 8 })])
    expect(csv).toContain('A1,Produit A,2,10.00,8.00,16.00')
  })

  it('escapes fields containing commas with double quotes', () => {
    const csv = cartItemsToCsv([item({ name: 'Produit, premium' })])
    expect(csv).toContain('"Produit, premium"')
  })

  it('escapes embedded double quotes by doubling them', () => {
    const csv = cartItemsToCsv([item({ name: 'Produit "X"' })])
    expect(csv).toContain('"Produit ""X"""')
  })

  it('handles multiple lines', () => {
    const csv = cartItemsToCsv([item({ sku: 'A' }), item({ sku: 'B', quantity: 3 })])
    expect(csv.split('\n')).toHaveLength(3)
  })
})
