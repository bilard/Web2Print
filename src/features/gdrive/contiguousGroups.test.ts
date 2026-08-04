import { describe, it, expect } from 'vitest'
import { contiguousGroups } from './gdriveCore'

/**
 * Un groupe Google Sheets est une PLAGE, et Sheets FUSIONNE les plages
 * adjacentes de même niveau. Une erreur ici ne casse rien de visible : elle
 * replie les mauvaises colonnes, ou fond tous les concurrents en un seul bloc.
 */
describe('contiguousGroups', () => {
  it('laisse la PREMIÈRE colonne de chaque concurrent hors du groupe', () => {
    // 3 colonnes communes, puis 2 concurrents de 3 colonnes.
    const cols = [undefined, undefined, undefined, 'kramp', 'kramp', 'kramp', 'rubix', 'rubix', 'rubix']
    // kramp = 4..5 (la 3 reste visible), rubix = 7..8 (la 6 reste visible).
    expect(contiguousGroups(cols)).toEqual([{ start: 4, end: 6 }, { start: 7, end: 9 }])
  })

  it('produit des groupes NON ADJACENTS — sinon Sheets les fusionne', () => {
    const cols = Array.from({ length: 18 }, (_, i) => `site${Math.floor(i / 9)}`)
    const g = contiguousGroups(cols)
    expect(g).toHaveLength(2)
    // Au moins une colonne libre entre la fin du premier et le début du second.
    expect(g[1].start).toBeGreaterThan(g[0].end)
  })

  it('n’englobe JAMAIS une colonne intercalée', () => {
    const cols = ['a', 'a', 'a', undefined, 'a', 'a', 'a']
    expect(contiguousGroups(cols)).toEqual([{ start: 1, end: 3 }, { start: 5, end: 7 }])
  })

  it('ignore un concurrent trop étroit — il ne resterait rien à replier', () => {
    // 2 colonnes : une visible + une seule à replier → sans intérêt.
    expect(contiguousGroups(['a', 'a'])).toEqual([])
    expect(contiguousGroups(['a'])).toEqual([])
  })

  it('ne groupe rien sans marquage', () => {
    expect(contiguousGroups([undefined, undefined])).toEqual([])
  })
})
