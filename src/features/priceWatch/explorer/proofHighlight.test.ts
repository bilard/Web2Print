import { describe, it, expect } from 'vitest'
import { highlightKey, proofSpot } from './proofHighlight'

/** Recompose le texte : un surlignage qui altère le libellé serait pire qu'aucun. */
const joined = (segs: { text: string }[]) => segs.map((s) => s.text).join('')
const marked = (segs: { text: string; hit: boolean }[]) => segs.filter((s) => s.hit).map((s) => s.text)

describe('highlightKey', () => {
  it('trouve la clé dans un libellé et rend le texte intact', () => {
    const text = 'Boîtier de commutation CASTELGARDEN 3816005331 - 381600533/1'
    const segs = highlightKey(text, '381600533/1'.replace(/[^0-9A-Z]/gi, ''))
    expect(joined(segs)).toBe(text)
    expect(marked(segs).join('')).toContain('381600533/1')
  })

  it('reconnaît les trois écritures d’une même référence', () => {
    // Les catalogues écrivent la même référence avec ou sans séparateur, avec ou sans
    // zéros de tête. Comparer les chaînes brutes n'en trouverait aucune.
    for (const written of ['3256000773', '325600077/3', '0003256000773']) {
      expect(marked(highlightKey(`Déflecteur ${written} pour tondeuse`, '3256000773'))).toHaveLength(1)
    }
  })

  it('ne marque pas un préfixe ni un sur-ensemble', () => {
    // `12345` ne prouve pas `123456` : c'est la règle de `proveMatch`, le surlignage ne
    // doit pas la contredire visuellement.
    expect(marked(highlightKey('Pièce 123456 renforcée', '12345'))).toEqual([])
    expect(marked(highlightKey('Pièce 1234 renforcée', '12345'))).toEqual([])
  })

  it('trouve une clé bordée de ponctuation', () => {
    expect(marked(highlightKey('Jante (4911070) avant', '4911070'))).toHaveLength(1)
  })

  it('compare un EAN sur sa forme normalisée', () => {
    const segs = highlightKey('Réf. 7313323188007 en stock', '7313323188007', true)
    expect(marked(segs).join('')).toContain('7313323188007')
  })

  it('reste sûr sur les cas vides', () => {
    expect(highlightKey('', 'ABC')).toEqual([])
    expect(highlightKey('Texte', '')).toEqual([{ text: 'Texte', hit: false }])
  })

  it('fusionne les segments de même nature', () => {
    // Sans fusion, un titre de dix mots produit vingt éléments de rendu pour rien.
    const segs = highlightKey('un titre assez long sans aucune clé dedans', 'ZZZ999')
    expect(segs).toHaveLength(1)
  })
})

describe('proofSpot', () => {
  it('désigne l’endroit où la preuve se lit', () => {
    expect(proofSpot('gtin13')).toBe('gtin')
    expect(proofSpot('sku')).toBe('ref')
    expect(proofSpot('mpn')).toBe('ref')
    expect(proofSpot('ref-in-name')).toBe('name')
    expect(proofSpot('ref-in-title')).toBe('name')
    // Rien à l'écran ne porte la valeur : il faut le DIRE plutôt que laisser chercher.
    expect(proofSpot('ean-in-url')).toBe('url')
    expect(proofSpot('ref-in-url')).toBe('url')
  })
})
