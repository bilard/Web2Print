import { describe, it, expect } from 'vitest'
import { countBands, countSourceFacts } from './stats'
import type { PairedRow } from './pairing'

describe('bandes de fiabilité', () => {
  const row = (band?: string) => ({ confidence: band ? { band } : undefined } as unknown as PairedRow)

  it('compte chaque bande', () => {
    expect(countBands([row('sure'), row('sure'), row('check'), row('doubt')]))
      .toEqual({ sure: 2, check: 1, doubt: 1 })
  })

  it('ignore les lignes sans verdict plutôt que de les ranger quelque part', () => {
    // Une ligne non évaluée n'est ni sûre ni douteuse : la compter fausserait le total
    // qui sert à expliquer une liste vidée par le filtre.
    expect(countBands([row(), row('sure')])).toEqual({ sure: 1, check: 0, doubt: 0 })
  })

  it('rend des zéros sur une liste vide', () => {
    expect(countBands([])).toEqual({ sure: 0, check: 0, doubt: 0 })
  })
})

describe('faits du catalogue source', () => {
  it('compte ce que chaque produit porte', () => {
    expect(countSourceFacts([
      { image: 'a.jpg', description: 'x' },
      { taxo: ['A', 'B'], url: 'https://x' },
      {},
    ])).toEqual({ products: 3, withImage: 1, withTaxo: 1, withDescription: 1, withUrl: 1 })
  })

  it('ne compte pas une taxonomie VIDE comme une taxonomie', () => {
    // Un tableau vide passerait un test de présence : c'est ce qui ferait croire la
    // taxonomie importée alors qu'il faut relancer « Comparer catalogue ».
    expect(countSourceFacts([{ taxo: [] }]).withTaxo).toBe(0)
  })
})
