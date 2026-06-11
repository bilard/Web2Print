// src/features/workflows/registry/priceWatchNode.test.ts
import { describe, it, expect } from 'vitest'
import { diffPriceRows, parsePrice } from './priceWatchNode'

describe('parsePrice', () => {
  it('parse les formats monétaires courants', () => {
    expect(parsePrice('1 299,90 €')).toBe(1299.9)
    expect(parsePrice('9.99')).toBe(9.99)
    expect(parsePrice(42)).toBe(42)
    expect(parsePrice('n/a')).toBeNaN()
    expect(parsePrice(null)).toBeNaN()
  })
})

describe('diffPriceRows', () => {
  const rows = [
    { url: 'a', price: '10,00 €', name: 'A' },
    { url: 'b', price: '20,00 €', name: 'B' },
    { url: 'c', price: 'indisponible', name: 'C' },
  ]

  it('détecte les variations et enrichit la ligne (ancien/nouveau/variation %)', () => {
    const { changes, nextValues } = diffPriceRows(rows, [{ key: 'a', value: 8 }, { key: 'b', value: 20 }], 'url', 'price', 0)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ url: 'a', ancien_prix: 8, nouveau_prix: 10, variation_pct: 25 })
    // c illisible → exclu de l'état ; a et b mémorisés
    expect(nextValues).toEqual([{ key: 'a', value: 10 }, { key: 'b', value: 20 }])
  })

  it('clé inconnue au run précédent = premier relevé, pas d’alerte', () => {
    const { changes } = diffPriceRows(rows, [], 'url', 'price', 0)
    expect(changes).toHaveLength(0)
  })

  it('respecte le seuil de variation', () => {
    const prev = [{ key: 'a', value: 9.8 }] // +2.04 %
    expect(diffPriceRows(rows, prev, 'url', 'price', 5).changes).toHaveLength(0)
    expect(diffPriceRows(rows, prev, 'url', 'price', 2).changes).toHaveLength(1)
  })
})
