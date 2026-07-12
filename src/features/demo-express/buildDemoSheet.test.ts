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

  it('prix SEUL ne suffit plus (un jeu concours affiche « 17 900 € ») → NON produit', () => {
    expect(isProductLike({ name: 'X', price: 129.9 })).toBe(false)
  })

  it('prix + vraies specs (≥ 3 paires saines) → produit', () => {
    expect(isProductLike({
      name: 'X',
      price: 129.9,
      specifications: 'Tension: 18V\nCapacité: 5Ah\nPoids: 2.1kg\nVitesse: 1800 tr/min',
    })).toBe(true)
  })

  it('specs seules SANS identité ni prix → NON produit (page formulaire métier)', () => {
    expect(isProductLike({
      name: 'X',
      specifications: 'Charpenterie et Menuiserie: Construction et Génie Civil\nDémolition: Electricité\nMaintenance: Mécanique, CVC et plomberie',
    })).toBe(false)
  })

  it('valeurs vides/null ne comptent pas comme signal', () => {
    expect(isProductLike({ reference: '  ', ean: null, price: undefined, specifications: '' })).toBe(false)
  })
})

describe('isProductLike — le bandeau cookies ne fabrique plus de fausses specs', () => {
  it('cas réel Milwaukee /metiers/plaquiste : 5 pseudo-specs CMP/nav → NON produit', () => {
    expect(isProductLike({
      name: 'Pourdesoutilsplusintelligents,plussûrsetplusefficaces',
      specifications: [
        'Plafonds: 2',
        "Voir toute la gamme d'outils: Mesures et repères\\\\",
        'Filter Button: ConsentLeg.Interest',
        'checkbox labellabel: checkbox labellabel',
        'Confirm My Choices: Allow All',
      ].join('\n'),
    })).toBe(false)
  })

  it('vraies specs (≥ 3) non affectées par le filtre CMP (avec prix)', () => {
    expect(isProductLike({
      price: '129.90',
      specifications: 'Tension: 18V\nCapacité: 5Ah\nPoids: 2.1kg',
    })).toBe(true)
  })
})
