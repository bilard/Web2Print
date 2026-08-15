// ⚠⚠ Le test qui compte : APRÈS CHAQUE GESTE, la tuile passe encore `parseDashboard`. Une
// tuile invalide ne serait refusée qu'à l'enregistrement — c'est-à-dire une fois le geste
// déjà fait, et l'utilisateur devant un message qu'il ne peut relier à rien.
import { describe, it, expect } from 'vitest'
import { parseDashboard, type Tile } from '../types'
import { testSource, testTile } from './wellFixture'
import { wellChips } from './wells'
import {
  dropInWell, removeFromWell, reorderWell, retypeTile, setChipAggregation, updateFilter,
} from './wellEdits'

const brand = { role: 'dimension' as const, id: 'brand', label: 'Marque' }
const price = { role: 'dimension' as const, id: 'price', label: 'Prix' }
const completeness = { role: 'measure' as const, id: 'pim.completeness', label: 'Complétude' }
const medianPrice = { role: 'measure' as const, id: 'median:price', label: 'Médiane · Prix' }

/** La tuile survit-elle au contrat ? On la range dans un tableau de bord minimal et on valide. */
function assertValid(tile: Tile): void {
  expect(() => parseDashboard({
    id: 'd1', name: 'D', accountId: 'a', workspaceUid: 'w',
    tiles: [tile], layout: [{ tileId: tile.id, x: 0, y: 0, w: 4, h: 4 }],
    filters: [], version: 1, createdAt: 0, updatedAt: 0, createdBy: 'u',
  })).not.toThrow()
}

describe('dropInWell', () => {
  it('pose une dimension sur l’axe d’un graphe, et REMPLACE celle en place', () => {
    const one = dropInWell(testTile('bar'), 'axis', brand, testSource)
    expect(one.query.dimensions).toEqual([{ id: 'brand' }])
    const two = dropInWell(one, 'axis', price, testSource)
    expect(two.query.dimensions).toEqual([{ id: 'price' }])
    assertValid(two)
  })

  it('ajoute les dimensions d’un TABLEAU les unes après les autres', () => {
    const t = dropInWell(dropInWell(testTile('table'), 'axis', brand, testSource),
      'axis', price, testSource)
    expect(t.query.dimensions).toEqual([{ id: 'brand' }, { id: 'price' }])
  })

  it('dérive une agrégation par DÉFAUT selon le type de la colonne', () => {
    const num = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    expect(num.query.measures.at(-1)).toEqual({ field: 'price', agg: 'sum' })
    const txt = dropInWell(testTile('bar', ['price']), 'values', brand, testSource)
    expect(txt.query.measures.at(-1)).toEqual({ field: 'brand', agg: 'count' })
  })

  it('remplace la mesure d’un INDICATEUR plutôt que d’en empiler une seconde', () => {
    const kpi = dropInWell(testTile('kpi'), 'values', price, testSource)
    expect(kpi.query.measures).toHaveLength(1)
    assertValid(kpi)
  })

  it('désigne la colonne du croisé quand la légende reçoit un champ', () => {
    const t = dropInWell(dropInWell(testTile('pivot'), 'axis', brand, testSource),
      'legend', price, testSource)
    expect(t.options?.pivotColumn).toBe('price')
    expect(t.query.dimensions.map((d) => d.id)).toEqual(['brand', 'price'])
    assertValid(t)
  })

  it('pose un filtre du visuel en « renseigné », qui ne vide jamais la tuile', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'visualFilters', price, testSource)
    expect(t.query.filters).toEqual([{ field: 'price', op: 'notEmpty' }])
  })

  it('range une mesure d’info-bulle À PART des valeurs', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'tooltips', completeness, testSource)
    expect(t.query.tooltips).toEqual([{ id: 'pim.completeness' }])
    expect(t.query.measures).toEqual([{ id: 'count' }])
    assertValid(t)
  })
})

describe('removeFromWell', () => {
  it('REFUSE de retirer la dernière mesure — le contrat en exige une', () => {
    const t = testTile('bar', ['brand'])
    expect(removeFromWell(t, 'values', 0)).toBe(t)
    assertValid(removeFromWell(t, 'values', 0))
  })

  it('retire une mesure dès qu’il en reste une autre', () => {
    const two = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    const back = removeFromWell(two, 'values', 0)
    expect(back.query.measures).toEqual([{ field: 'price', agg: 'sum' }])
    assertValid(back)
  })

  it('largue le tri quand la mesure qu’il désigne s’en va', () => {
    const two = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    const sorted: Tile = { ...two, query: { ...two.query, sort: [{ by: 'sum:price', dir: 'desc' }] } }
    expect(removeFromWell(sorted, 'values', 1).query.sort).toBeUndefined()
  })

  it('efface la colonne du croisé avec la dimension qui la portait', () => {
    const t = dropInWell(dropInWell(testTile('pivot'), 'axis', brand, testSource),
      'legend', price, testSource)
    const back = removeFromWell(t, 'legend', 1)
    expect(back.options?.pivotColumn).toBeUndefined()
    assertValid(back)
  })

  it('vide `tooltips` plutôt que d’y laisser un tableau vide', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'tooltips', completeness, testSource)
    expect(removeFromWell(t, 'tooltips', 0).query.tooltips).toBeUndefined()
  })
})

describe('reorderWell et setChipAggregation', () => {
  it('réordonne les valeurs', () => {
    const two = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    const moved = reorderWell(two, 'values', 1, 0)
    expect(moved.query.measures.map((m) => JSON.stringify(m)))
      .toEqual([JSON.stringify({ field: 'price', agg: 'sum' }), JSON.stringify({ id: 'count' })])
    assertValid(moved)
  })

  it('change l’agrégation d’une mesure dérivée, et LAISSE une mesure déclarée intacte', () => {
    const two = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    const avg = setChipAggregation(two, 'values', 1, 'avg')
    expect(avg.query.measures[1]).toEqual({ field: 'price', agg: 'avg' })
    expect(setChipAggregation(two, 'values', 0, 'avg').query.measures[0]).toEqual({ id: 'count' })
  })

  it('retouche un filtre du visuel', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'visualFilters', price, testSource)
    const gt = updateFilter(t, 0, { op: 'gt', value: 10 })
    expect(gt.query.filters[0]).toEqual({ field: 'price', op: 'gt', value: 10 })
    assertValid(gt)
  })
})

describe('retypeTile', () => {
  // ⚠⚠ L'indicateur GARDE l'axe d'un graphe basculé : il en fait sa tendance (dernier point
  // en grand, variation, courbe). Il le dépouillait auparavant, faute de savoir quoi en
  // faire d'autre qu'un chiffre pris au hasard parmi les groupes.
  it('garde l’axe d’un graphe passé en indicateur — il en fait sa tendance', () => {
    const bar = dropInWell(testTile('bar'), 'axis', brand, testSource)
    const kpi = retypeTile(bar, 'kpi')
    expect(kpi.query.dimensions).toHaveLength(1)
    assertValid(kpi)
  })

  it('ramène un camembert à UNE mesure', () => {
    const two = dropInWell(testTile('bar', ['brand']), 'values', price, testSource)
    const pie = retypeTile(two, 'pie')
    expect(pie.query.measures).toHaveLength(1)
    assertValid(pie)
  })

  it('ramène un CROISÉ passé en indicateur à UN seul axe, et perd sa colonne de croisement', () => {
    const pivot = dropInWell(dropInWell(testTile('pivot'), 'axis', brand, testSource),
      'legend', price, testSource)
    const kpi = retypeTile(pivot, 'kpi')
    // ⚠ UN axe : c'est tout ce qu'une tendance peut porter. Le second n'aurait nulle part
    // où s'afficher, et un croisement sans colonne ne croise plus rien.
    expect(kpi.query.dimensions).toHaveLength(1)
    expect(kpi.options?.pivotColumn).toBeUndefined()
    assertValid(kpi)
  })

  it('garde les options SURVIVANTES en effaçant la seule colonne de croisement', () => {
    // ⚠ Un visuel empilé passé en camembert : `stacked` reste, `pivotColumn` part. L'objet
    // porte alors une clé à `undefined` — `parseDashboard` l'accepte, et `useTileEdits`
    // la neutralise dans sa comparaison (sinon la surcharge locale ne s'élaguerait jamais).
    const stacked: Tile = {
      ...dropInWell(testTile('bar', ['brand']), 'values', price, testSource),
      options: { stacked: true },
    }
    const pie = retypeTile(stacked, 'pie')
    expect(pie.options?.stacked).toBe(true)
    expect(pie.options?.pivotColumn).toBeUndefined()
    assertValid(pie)
  })

  it('redésigne la colonne du croisé quand elle a survécu à la coupe', () => {
    const table = dropInWell(dropInWell(testTile('table'), 'axis', brand, testSource),
      'axis', price, testSource)
    const pivot = retypeTile(table, 'pivot')
    expect(pivot.options?.pivotColumn).toBe('price')
    expect(wellChips('legend', pivot, testSource).map((c) => c.id)).toEqual(['price'])
    assertValid(pivot)
  })

  it('jette les info-bulles d’un type qui n’en affiche pas', () => {
    const t = dropInWell(testTile('bar', ['brand']), 'tooltips', medianPrice, testSource)
    const table = retypeTile(t, 'table')
    expect(table.query.tooltips).toBeUndefined()
    assertValid(table)
  })
})
