import { describe, it, expect } from 'vitest'
import { searchCatalog, catalogFacts } from './catalogList'
import type { SourceProduct } from '../catalog/match'

const p = (over: Partial<SourceProduct>): SourceProduct => ({ id: 'x', name: '', ...over })

const CATALOG: SourceProduct[] = [
  p({ id: '1', name: 'Joint de cuve carburateur', ref: '820WD40400', ean: '5032227330047' }),
  p({ id: '2', name: 'Courroie trapézoïdale A97', ref: '1134-4319-01', price: 12 }),
  p({ id: '3', name: 'Carburateur KUBOTA', ref: 'RB10151282', image: 'x.jpg' }),
]

describe('recherche au catalogue', () => {
  it('rend tout sur une saisie vide', () => {
    expect(searchCatalog(CATALOG, '  ')).toHaveLength(3)
  })

  it('trouve par mot, où qu’il soit dans le libellé', () => {
    expect(searchCatalog(CATALOG, 'carburateur').map((x) => x.id)).toEqual(['1', '3'])
  })

  it('exige TOUS les mots, dans n’importe quel ordre', () => {
    // « joint carburateur » et « carburateur joint » désignent la même intention.
    expect(searchCatalog(CATALOG, 'carburateur joint').map((x) => x.id)).toEqual(['1'])
    expect(searchCatalog(CATALOG, 'joint kubota')).toEqual([])
  })

  it('⚠ trouve une référence saisie avec ses tirets', () => {
    // Le catalogue la stocke telle quelle, mais l'appariement la normalise : une recherche
    // plus stricte que le moteur ferait dire « absent » d'un produit qu'il rapproche.
    expect(searchCatalog(CATALOG, '1134 4319 01').map((x) => x.id)).toEqual(['2'])
  })

  it('trouve par code-barres', () => {
    expect(searchCatalog(CATALOG, '5032227330047').map((x) => x.id)).toEqual(['1'])
  })

  it('ne rend rien plutôt que tout quand rien ne correspond', () => {
    expect(searchCatalog(CATALOG, 'inexistant')).toEqual([])
  })
})

describe('faits du catalogue', () => {
  it('compte le total, l’affiché et ce qui est exploitable', () => {
    const shown = searchCatalog(CATALOG, 'carburateur')
    expect(catalogFacts(CATALOG, shown)).toEqual({ total: 3, shown: 2, withPrice: 0, withImage: 1 })
  })
})
