import { describe, it, expect } from 'vitest'
import { diagnoseEmptySearch } from './emptySearch'
import type { SourceProduct } from '../catalog/match'

const CATALOGUE: SourceProduct[] = [
  { id: 'a', name: 'ENJOLIVEUR', ref: '122600092/0', ean: '8008984359130', price: 2.92 },
  { id: 'b', name: 'COURROIE A35', ref: 'F1633', price: 9.75 },
  { id: 'c', name: 'LAME', ref: '181004383', ref2: 'ALT-99', price: 12 },
]

describe('diagnoseEmptySearch', () => {
  it('reconnaît un code-barres du catalogue — le cas vécu', () => {
    // L'EAN d'un enjoliveur, cherché sur un vendeur de courroies : la fiche n'existe pas
    // chez ce marchand, mais le produit est bien au catalogue. Le dire évite de croire
    // que la saisie est fausse.
    expect(diagnoseEmptySearch('8008984359130', CATALOGUE)?.product.name).toBe('ENJOLIVEUR')
  })

  it('tolère les séparateurs de saisie, des deux côtés', () => {
    expect(diagnoseEmptySearch('8 008984 359130', CATALOGUE)?.product.id).toBe('a')
    expect(diagnoseEmptySearch('1226000920', CATALOGUE)?.product.id).toBe('a')
    expect(diagnoseEmptySearch('122600092-0', CATALOGUE)?.product.id).toBe('a')
  })

  it('reconnaît une référence secondaire', () => {
    expect(diagnoseEmptySearch('ALT-99', CATALOGUE)?.product.id).toBe('c')
  })

  it('se tait sur un MOT — « tondeuse » n’est pas une référence introuvable', () => {
    expect(diagnoseEmptySearch('tondeuse', CATALOGUE)).toBeNull()
    expect(diagnoseEmptySearch('courroie trapézoïdale', CATALOGUE)).toBeNull()
  })

  it('se tait sur une saisie trop courte ou inconnue', () => {
    expect(diagnoseEmptySearch('12', CATALOGUE)).toBeNull()
    expect(diagnoseEmptySearch('9999999999999', CATALOGUE)).toBeNull()
  })
})
