import { describe, it, expect } from 'vitest'
import { parsePrice, formatPrice, computeMechanism } from './priceParse'

describe('parsePrice', () => {
  it('parse les formats FR avec devise/espaces/virgule', () => {
    expect(parsePrice('12,99 €')).toBe(12.99)
    expect(parsePrice('1 299,00')).toBe(1299)
    expect(parsePrice('19.90')).toBe(19.9)
    expect(parsePrice(7)).toBe(7)
  })
  it('renvoie null si non numérique', () => {
    expect(parsePrice('')).toBeNull()
    expect(parsePrice('Prix sur demande')).toBeNull()
    expect(parsePrice(null)).toBeNull()
  })
})

describe('formatPrice', () => {
  it('formate en FR avec symbole', () => {
    expect(formatPrice(12.9, 'EUR')).toBe('12,90 €')
    expect(formatPrice(1299, 'EUR')).toBe('1 299,00 €')
  })
})

describe('computeMechanism', () => {
  it('remise = pourcentage + montant arrondis', () => {
    expect(computeMechanism({ oldPrice: 100, newPrice: 75, lotQty: null, lotOffert: null, lotPrice: null }))
      .toEqual({ mechanism: 'remise', remisePct: 25, remiseMontant: 25 })
  })
  it('lot quand lotQty/lotOffert présents', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: 2, lotOffert: 1, lotPrice: null }).mechanism).toBe('lot')
  })
  it('pack quand lotPrice présent sans offert', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: 2, lotOffert: null, lotPrice: 9 }).mechanism).toBe('pack')
  })
  it('simple quand pas de remise ni lot', () => {
    expect(computeMechanism({ oldPrice: null, newPrice: 5, lotQty: null, lotOffert: null, lotPrice: null }).mechanism).toBe('simple')
  })
  it('pas de remise si new >= old', () => {
    expect(computeMechanism({ oldPrice: 10, newPrice: 12, lotQty: null, lotOffert: null, lotPrice: null }).remisePct).toBeNull()
  })
})
