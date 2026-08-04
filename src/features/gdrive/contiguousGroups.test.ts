import { describe, it, expect } from 'vitest'
import { contiguousGroups } from './gdriveCore'

/**
 * Un groupe Google Sheets est une PLAGE : une erreur ici ne casse rien
 * visiblement, elle replie simplement les mauvaises colonnes.
 */
describe('contiguousGroups', () => {
  it('regroupe les colonnes consécutives d’un même concurrent', () => {
    // 3 colonnes communes, puis 2 concurrents de 3 colonnes.
    const cols = [undefined, undefined, undefined, 'kramp.com', 'kramp.com', 'kramp.com', 'rubix.fr', 'rubix.fr', 'rubix.fr']
    expect(contiguousGroups(cols)).toEqual([{ start: 3, end: 6 }, { start: 6, end: 9 }])
  })

  it('n’englobe JAMAIS une colonne intercalée', () => {
    // Un groupe interrompu donne deux plages, pas une plage qui avalerait « x ».
    const cols = ['a', 'a', undefined, 'a', 'a']
    expect(contiguousGroups(cols)).toEqual([{ start: 0, end: 2 }, { start: 3, end: 5 }])
  })

  it('ignore une colonne seule — il n’y a rien à replier', () => {
    expect(contiguousGroups(['a', undefined, 'b'])).toEqual([])
  })

  it('ne groupe rien sans marquage', () => {
    expect(contiguousGroups([undefined, undefined])).toEqual([])
  })
})
