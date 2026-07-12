import { describe, it, expect } from 'vitest'
import { isProductLike } from './buildDemoSheet'

describe('isProductLike — écarte les pages éditoriales de la découverte', () => {
  it('page rubrique (ni réf, ni EAN, ni prix, 2 pseudo-specs) → NON produit', () => {
    // Cas réel : landing « Plaquiste » milwaukeetool.fr (specs absurdes « Plafonds: 2 »).
    expect(isProductLike({
      name: 'Pour des outils plus intelligents, plus sûrs',
      description: 'Découvrez la gamme…',
      advantages: 'Mesures et repères Découpage des plaques',
      specifications: 'Plafonds: 2\nVOTRE APPLICATION: Plafonds',
    })).toBe(false)
  })

  it('fiche fabricant SANS prix mais avec référence → produit', () => {
    expect(isProductLike({ name: 'M18 FUEL', reference: 'M18ONEPD2-502X' })).toBe(true)
  })

  it('fiche avec EAN seul → produit', () => {
    expect(isProductLike({ name: 'X', ean: '4058546325749' })).toBe(true)
  })

  it('fiche avec prix seul → produit', () => {
    expect(isProductLike({ name: 'X', price: 129.9 })).toBe(true)
  })

  it('fiche sans commerce mais avec vraies specs (≥ 3 paires) → produit', () => {
    expect(isProductLike({
      name: 'X',
      specifications: 'Tension: 18V\nCapacité: 5Ah\nPoids: 2.1kg\nVitesse: 1800 tr/min',
    })).toBe(true)
  })

  it('valeurs vides/null ne comptent pas comme signal', () => {
    expect(isProductLike({ reference: '  ', ean: null, price: undefined, specifications: '' })).toBe(false)
  })
})
