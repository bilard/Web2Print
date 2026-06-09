import { describe, it, expect } from 'vitest'
import { parsePriceParts } from './refinePrices'

describe('parsePriceParts', () => {
  it('parse un prix euro classique', () => {
    expect(parsePriceParts('9,59 €')).toEqual({ integer: '9', decimals: '59', currency: '€' })
  })

  it('parse un prix entier sans devise (€ par défaut)', () => {
    expect(parsePriceParts('5')).toEqual({ integer: '5', decimals: null, currency: '€' })
  })

  it('parse un point décimal', () => {
    expect(parsePriceParts('4.79')).toEqual({ integer: '4', decimals: '79', currency: '€' })
  })

  it('parse une devise alphabétique majuscule (dinar tunisien)', () => {
    // Régression : "22,99 DT" retournait null → fallback Textbox mono-ligne
    // à la hauteur de la bbox entière (prix géant débordant de la carte).
    expect(parsePriceParts('22,99 DT')).toEqual({ integer: '22', decimals: '99', currency: 'DT' })
    expect(parsePriceParts('15 TND')).toEqual({ integer: '15', decimals: null, currency: 'TND' })
  })

  it('parse les symboles $ et £', () => {
    expect(parsePriceParts('12.50 $')).toEqual({ integer: '12', decimals: '50', currency: '$' })
    expect(parsePriceParts('8 £')).toEqual({ integer: '8', decimals: null, currency: '£' })
  })

  it('rejette les unités en minuscules (quantités, pas des prix)', () => {
    expect(parsePriceParts('150 ml')).toBeNull()
    expect(parsePriceParts('55 g')).toBeNull()
  })

  it('rejette les chaînes non-prix', () => {
    expect(parsePriceParts('GRATUIT')).toBeNull()
    expect(parsePriceParts('22,99 DINARS')).toBeNull()
    expect(parsePriceParts('')).toBeNull()
  })
})
