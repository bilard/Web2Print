// indesign-plugin/src/lib/slug.test.ts
import { describe, it, expect } from 'vitest'
import { slugifyTag } from './slug'

describe('slugifyTag', () => {
  it('garde un nom simple', () => expect(slugifyTag('Reference')).toBe('Reference'))
  it('translittère accents et espaces', () => expect(slugifyTag('Référence produit')).toBe('Reference_produit'))
  it('remplace les caractères interdits', () => expect(slugifyTag('Prix (€)')).toBe('Prix_'))
  it('préfixe si commence par un chiffre', () => expect(slugifyTag('2024')).toBe('_2024'))
  it('vide → _', () => expect(slugifyTag('   ')).toBe('_'))
})
