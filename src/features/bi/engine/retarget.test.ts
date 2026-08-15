// ⚠⚠ Ce que ces tests protègent : un tableau abîmé d'un clic sur un menu. Basculer une tuile
// vers une source qui ne porte pas ses champs donne des chiffres justes sur un autre sujet,
// ou une tuile morte à la réouverture — dans les deux cas sans un mot.
import { describe, it, expect } from 'vitest'
import { retargetTiles } from './retarget'
import type { DataSource } from '../registry/types'
import type { Tile } from '../types'

const target: DataSource = {
  id: 'watch.catalog', labelKey: 'bi.source.watchCatalog', engine: 'client',
  dimensions: [
    { id: 'family', labelKey: 'bi.dim.column', kind: 'text', get: (r) => r.family },
    { id: 'price', labelKey: 'bi.dim.column', kind: 'number', get: (r) => r.price },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true, compute: () => 0 },
  ],
}

const tile = (id: string, q: Partial<Tile['query']>, options?: Tile['options']): Tile => ({
  id, kind: 'bar', title: id,
  query: { source: 'watch.summary', measures: [{ id: 'count' }], dimensions: [], filters: [], ...q },
  ...(options ? { options } : {}),
})

describe('changement de source des tuiles existantes', () => {
  it('bascule une tuile dont TOUS les champs existent à l’arrivée', () => {
    const r = retargetTiles([tile('a', { dimensions: [{ id: 'family' }] })], 'watch.catalog', target)
    expect(r.moved).toBe(1)
    expect(r.tiles[0].query.source).toBe('watch.catalog')
    expect(r.blocked).toEqual([])
  })

  it('refabrique une mesure DÉRIVÉE si la colonne le permet', () => {
    // `sum:price` n'est pas déclarée par la source, mais `price` est numérique : le moteur
    // saura la calculer, exactement comme il le fait au rendu.
    const r = retargetTiles(
      [tile('a', { measures: [{ field: 'price', agg: 'sum' }], dimensions: [{ id: 'family' }] })],
      'watch.catalog', target)
    expect(r.moved).toBe(1)
  })

  it('⚠⚠ LAISSE en place une tuile dont une mesure manque, et NOMME le champ', () => {
    const r = retargetTiles([tile('Écarts', { measures: [{ id: 'watch.medGap' }] })], 'watch.catalog', target)
    expect(r.moved).toBe(0)
    expect(r.tiles[0].query.source).toBe('watch.summary') // inchangée
    expect(r.blocked).toEqual([{ title: 'Écarts', field: 'watch.medGap' }])
  })

  it('refuse aussi sur une DIMENSION, un FILTRE ou une colonne de croisement absents', () => {
    const dim = retargetTiles([tile('d', { dimensions: [{ id: 'domain' }] })], 'watch.catalog', target)
    expect(dim.blocked[0].field).toBe('domain')

    const filt = retargetTiles(
      [tile('f', { filters: [{ field: 'domain', op: 'eq', value: 'a.fr' }] })], 'watch.catalog', target)
    expect(filt.blocked[0].field).toBe('domain')

    const piv = retargetTiles(
      [tile('p', { dimensions: [{ id: 'family' }] }, { pivotColumn: 'domain' })], 'watch.catalog', target)
    expect(piv.blocked[0].field).toBe('domain')
  })

  it('⚠ refuse une agrégation que le TYPE de la colonne n’autorise pas', () => {
    // Sommer un libellé n'a pas de sens : la tuile tomberait en erreur au premier calcul.
    const r = retargetTiles(
      [tile('a', { measures: [{ field: 'family', agg: 'sum' }] })], 'watch.catalog', target)
    expect(r.moved).toBe(0)
    expect(r.blocked[0].field).toBe('sum:family')
  })

  it('ne compte pas une tuile DÉJÀ sur la source d’arrivée', () => {
    const r = retargetTiles(
      [tile('a', { source: 'watch.catalog', dimensions: [{ id: 'family' }] })], 'watch.catalog', target)
    expect(r.moved).toBe(0)
    expect(r.blocked).toEqual([])
  })
})
