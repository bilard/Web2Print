import { describe, it, expect } from 'vitest'
import { contiguousGroups } from './gdriveCore'

/**
 * Un groupe Google Sheets est une PLAGE, et Sheets FUSIONNE les plages
 * adjacentes de même niveau. Une erreur ici ne casse rien de visible : elle
 * replie les mauvaises colonnes, ou fond tous les concurrents en un seul bloc.
 */
describe('contiguousGroups', () => {
  it('couvre le bloc ENTIER quand une colonne libre le précède', () => {
    // C'est la forme produite par `siteColumns` : une colonne de section (non marquée)
    // ouvre chaque concurrent, donc le repli emporte tout le bloc — nom compris.
    const cols = [undefined, 'kramp', 'kramp', 'kramp', undefined, 'rubix', 'rubix', 'rubix']
    expect(contiguousGroups(cols)).toEqual([{ start: 1, end: 4 }, { start: 5, end: 8 }])
  })

  it('cède la première colonne quand deux blocs se TOUCHENT', () => {
    // Sans séparateur, couvrir les deux blocs en entier les ferait fusionner en un seul.
    const cols = [undefined, 'kramp', 'kramp', 'kramp', 'rubix', 'rubix', 'rubix']
    expect(contiguousGroups(cols)).toEqual([{ start: 1, end: 4 }, { start: 5, end: 7 }])
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
    expect(contiguousGroups(cols)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }])
  })

  it('ignore un concurrent trop étroit — il ne resterait rien à replier', () => {
    // 2 colonnes : une visible + une seule à replier → sans intérêt.
    expect(contiguousGroups(['a'])).toEqual([])
    // Deux colonnes précédées d'une libre : le bloc est groupable en entier.
    expect(contiguousGroups([undefined, 'a', 'a'])).toEqual([{ start: 1, end: 3 }])
  })

  it('ne groupe rien sans marquage', () => {
    expect(contiguousGroups([undefined, undefined])).toEqual([])
  })
})
