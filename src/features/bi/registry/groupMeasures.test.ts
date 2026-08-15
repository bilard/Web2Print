// ⚠⚠ Ce que ces tests protègent : une liste où l'on renonce à chercher. Une source de veille
// dérive plus de cent mesures ; à plat, celle qu'on veut se perd entre deux voisines qui ne
// lui ressemblent pas.
import { describe, it, expect } from 'vitest'
import { groupMeasures } from './groupMeasures'
import type { Measure } from './types'

const m = (id: string): Measure => ({
  id, labelKey: 'bi.measure.count', format: 'int', aggregable: true, compute: () => 0,
})

describe('mesures groupées par type', () => {
  it('met les mesures DÉCLARÉES en tête, dans leur ordre d’origine', () => {
    // Ce sont celles que le métier a nommées, et qu'un moteur générique calculerait faux.
    const groups = groupMeasures([m('sum:price'), m('watch.matched'), m('count'), m('avg:price')])
    expect(groups[0].key).toBe('declared')
    expect(groups[0].measures.map((x) => x.id)).toEqual(['watch.matched', 'count'])
  })

  it('range les groupes dans l’ordre des agrégations, pas de rencontre', () => {
    // Deux sources rangeraient sinon leurs mesures différemment, et l'œil devrait
    // réapprendre à chaque changement de jeu de données.
    const groups = groupMeasures([m('median:a'), m('sum:b'), m('count:c'), m('avg:d')])
    expect(groups.map((g) => g.key)).toEqual(['count', 'sum', 'avg', 'median'])
  })

  it('porte la clé de traduction de chaque agrégation', () => {
    expect(groupMeasures([m('filledPct:a')])[0].labelKey).toBe('bi.agg.filledPct')
  })

  it('⚠ ne prend pas un identifiant à deux-points pour une agrégation', () => {
    // Une mesure déclarée peut porter n'importe quel identifiant : seule une agrégation
    // CONNUE en préfixe fait une mesure dérivée.
    const groups = groupMeasures([m('watch:custom'), m('sum:price')])
    expect(groups[0].measures.map((x) => x.id)).toEqual(['watch:custom'])
    expect(groups[1].key).toBe('sum')
  })

  it('ne rend AUCUN groupe vide', () => {
    expect(groupMeasures([])).toEqual([])
    expect(groupMeasures([m('sum:a')]).map((g) => g.key)).toEqual(['sum'])
  })
})
