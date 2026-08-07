import { describe, it, expect } from 'vitest'
import { contiguousGroups } from './gdriveCore'

/**
 * Un groupe Google Sheets est une PLAGE, et Sheets FUSIONNE les plages
 * adjacentes de même niveau. Une erreur ici ne casse rien de visible : elle
 * replie les mauvaises colonnes, ou fond tous les concurrents en un seul bloc.
 */
describe('contiguousGroups', () => {
  it('laisse TOUJOURS la première colonne du bloc hors du groupe', () => {
    // ⚠ Mesuré en production : avec une seule colonne libre entre deux plages, Sheets les
    // FUSIONNE — quatorze concurrents n'ont donné qu'un crochet de cent trente colonnes.
    // Il faut deux colonnes libres : celle de tête (non marquée) et celle-ci.
    const cols = [undefined, 'kramp', 'kramp', 'kramp', undefined, 'rubix', 'rubix', 'rubix']
    expect(contiguousGroups(cols)).toEqual([{ start: 2, end: 4 }, { start: 6, end: 8 }])
  })

  it('produit des plages séparées par DEUX colonnes au moins', () => {
    const cols = [undefined, 'a', 'a', 'a', undefined, 'b', 'b', 'b', undefined, 'c', 'c', 'c']
    const g = contiguousGroups(cols)
    expect(g).toHaveLength(3)
    for (let i = 1; i < g.length; i++) expect(g[i].start - g[i - 1].end).toBeGreaterThanOrEqual(2)
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
    expect(contiguousGroups(['a'])).toEqual([])
    expect(contiguousGroups(['a', 'a'])).toEqual([])
    // Trois colonnes : il en reste deux à replier une fois la première laissée visible.
    expect(contiguousGroups([undefined, 'a', 'a', 'a'])).toEqual([{ start: 2, end: 4 }])
  })

  it('ne groupe rien sans marquage', () => {
    expect(contiguousGroups([undefined, undefined])).toEqual([])
  })
})
