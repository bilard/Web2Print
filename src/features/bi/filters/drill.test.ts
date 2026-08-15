// ⚠⚠ Ce que ces tests protègent : forer sans retenir la valeur cliquée. L'axe changerait
// de niveau et l'utilisateur croirait avoir foré, alors qu'il lirait TOUTES les familles de
// tous les univers — des chiffres sans rapport avec ce qu'il vient de cliquer.
import { describe, it, expect } from 'vitest'
import { drillDown, drillUp, nextLevel, applyDrill } from './drill'
import type { QuerySpec } from '../types'

const query: QuerySpec = {
  source: 'pim.products',
  measures: [{ id: 'count' }],
  dimensions: [{ id: 'taxo.1' }],
  filters: [],
}

describe('nextLevel', () => {
  it('descend le long de la taxonomie', () => {
    expect(nextLevel('taxo.1')).toBe('taxo.2')
    expect(nextLevel('taxo.3')).toBe('taxo.4')
  })

  it('n’invente pas de niveau sous le dernier, ni sous une dimension hors hiérarchie', () => {
    expect(nextLevel('taxo.4')).toBeNull()
    expect(nextLevel('domain')).toBeNull()
  })

  it('respecte la hiérarchie déclarée par la tuile, qui prime', () => {
    expect(nextLevel('domain', ['domain', 'brand'])).toBe('brand')
  })
})

describe('drillDown', () => {
  it('change d’axe ET retient la valeur cliquée', () => {
    const r = drillDown(query, 'Terrasse & Jardin')
    expect(r?.query.dimensions[0]).toEqual({ id: 'taxo.2' })
    expect(r?.query.filters).toEqual([{ field: 'taxo.1', op: 'eq', value: 'Terrasse & Jardin' }])
    expect(r?.step).toEqual({ field: 'taxo.1', value: 'Terrasse & Jardin' })
  })

  it('retient l’ABSENCE comme une valeur : « sans univers » se fore aussi', () => {
    const r = drillDown(query, null)
    expect(r?.query.filters[0].value).toBeNull()
  })

  it('rend null au dernier niveau, plutôt qu’une requête identique', () => {
    // ⚠ Une requête inchangée se lirait comme un geste sans effet : l'appelant doit pouvoir
    // désactiver le forage, pas le laisser tourner à vide.
    expect(drillDown({ ...query, dimensions: [{ id: 'taxo.4' }] }, 'x')).toBeNull()
    expect(drillDown({ ...query, dimensions: [] }, 'x')).toBeNull()
  })

  it('laisse intactes la légende et les autres filtres', () => {
    const withMore: QuerySpec = {
      ...query,
      dimensions: [{ id: 'taxo.1' }, { id: 'brand' }],
      filters: [{ field: 'price', op: 'gte', value: 10 }],
    }
    const r = drillDown(withMore, 'Cuisine')
    expect(r?.query.dimensions[1]).toEqual({ id: 'brand' })
    expect(r?.query.filters).toContainEqual({ field: 'price', op: 'gte', value: 10 })
  })
})

describe('drillUp', () => {
  it('remonte au niveau visé et défait son filtre', () => {
    const down = drillDown(query, 'Cuisine')!
    const up = drillUp(down.query, [down.step], 0)
    expect(up.query.dimensions[0]).toEqual({ id: 'taxo.1' })
    expect(up.query.filters).toEqual([])
    expect(up.steps).toEqual([])
  })

  it('défait AUSSI les niveaux plus profonds', () => {
    // ⚠ Remonter à l'univers en gardant un filtre de famille afficherait un total amputé
    // sous un intitulé qui promet l'ensemble.
    const d1 = drillDown(query, 'Cuisine')!
    const d2 = drillDown(d1.query, 'Robinetterie')!
    const up = drillUp(d2.query, [d1.step, d2.step], 0)
    expect(up.query.dimensions[0]).toEqual({ id: 'taxo.1' })
    expect(up.query.filters).toEqual([])
  })

  it('ne touche à rien quand il n’y a aucun pas à défaire', () => {
    const up = drillUp(query, [], 0)
    expect(up.query).toBe(query)
  })
})

describe('applyDrill', () => {
  it('rejoue les pas dans l’ordre, sans toucher à la requête enregistrée', () => {
    const d1 = drillDown(query, 'Cuisine')!
    const d2 = drillDown(d1.query, 'Robinetterie')!
    const replayed = applyDrill(query, [d1.step, d2.step])
    expect(replayed.dimensions[0]).toEqual({ id: 'taxo.3' })
    expect(replayed.filters).toEqual([
      { field: 'taxo.1', op: 'eq', value: 'Cuisine' },
      { field: 'taxo.2', op: 'eq', value: 'Robinetterie' },
    ])
    // ⚠ La requête d'origine est intacte : le forage n'écrit jamais dans la tuile.
    expect(query.dimensions).toEqual([{ id: 'taxo.1' }])
    expect(query.filters).toEqual([])
  })

  it('s’arrête proprement quand un pas n’a plus de niveau en dessous', () => {
    const deep = { ...query, dimensions: [{ id: 'taxo.4' }] }
    expect(applyDrill(deep, [{ field: 'taxo.4', value: 'x' }])).toBe(deep)
  })
})
