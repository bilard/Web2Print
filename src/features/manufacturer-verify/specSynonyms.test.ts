import { describe, it, expect } from 'vitest'
import { canonicalizeSpecName, normalizeValueForCompare } from './specSynonyms'

describe('canonicalizeSpecName', () => {
  it('aligne des libellés synonymes vers la même clé canonique', () => {
    const a = canonicalizeSpecName('Puissance')
    const b = canonicalizeSpecName('Puissance nominale absorbée')
    expect(a).toBe('puissance')
    expect(b).toBe('puissance')
  })

  it('aligne « Poids » et « Masse »', () => {
    expect(canonicalizeSpecName('Poids')).toBe('poids')
    expect(canonicalizeSpecName('Masse')).toBe('poids')
  })

  it('aligne « Vitesse de rotation » et « Régime à vide »', () => {
    expect(canonicalizeSpecName('Vitesse de rotation')).toBe('vitesse_rotation')
    expect(canonicalizeSpecName('Régime à vide')).toBe('vitesse_rotation')
  })

  it('retourne null pour un libellé inconnu', () => {
    expect(canonicalizeSpecName('Numéro de lot logistique')).toBeNull()
  })
})

describe('normalizeValueForCompare', () => {
  it('rend 1500 W équivalent à 1,5 kW', () => {
    expect(normalizeValueForCompare('1500 W')).toBe(normalizeValueForCompare('1,5 kW'))
  })

  it('rend 13 mm équivalent à 1,3 cm', () => {
    expect(normalizeValueForCompare('13 mm')).toBe(normalizeValueForCompare('1,3 cm'))
  })

  it('rend 2.0 équivalent à 2', () => {
    expect(normalizeValueForCompare('2.0')).toBe(normalizeValueForCompare('2'))
  })

  it('distingue des unités de familles différentes', () => {
    expect(normalizeValueForCompare('1500 W')).not.toBe(normalizeValueForCompare('1500 mm'))
  })

  it('normalise le texte (casse/accents)', () => {
    expect(normalizeValueForCompare('Métal')).toBe(normalizeValueForCompare('metal'))
  })
})
