import { describe, it, expect } from 'vitest'
import { slugifyTag } from './slug'

describe('slugifyTag', () => {
  it('garde un nom simple', () => expect(slugifyTag('Reference')).toBe('Reference'))
  it('préserve les accents (valides en NCName)', () => expect(slugifyTag('Référence')).toBe('Référence'))
  it('remplace les espaces par _', () => expect(slugifyTag('Nom du produit')).toBe('Nom_du_produit'))
  it('accents + espace', () => expect(slugifyTag('Référence produit')).toBe('Référence_produit'))
  it('remplace les caractères interdits', () => expect(slugifyTag('Prix (€)')).toBe('Prix_'))
  it('préfixe si commence par un chiffre', () => expect(slugifyTag('2024')).toBe('_2024'))
  it('vide → _', () => expect(slugifyTag('   ')).toBe('_'))
})
