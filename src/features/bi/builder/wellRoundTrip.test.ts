// ⚠⚠ L'ALLER-RETOUR : une tuile ouverte dans le constructeur et REPOSÉE SANS Y TOUCHER doit
// ressortir strictement identique.
//
// Défaut constaté en production : une tuile avait perdu sa dimension (`dimensions: []`, donc
// une seule barre au lieu d'une par concurrent) alors que ses tuiles sœurs l'avaient gardée.
// Une configuration abîmée en base est le pire défaut possible de ce module — elle survit au
// rechargement, elle se lit comme une donnée, et personne ne sait d'où elle vient.
//
// Deux garanties, testées ici pour les HUIT types de visuel :
//
// 1. **Rien n'est INVISIBLE.** Chaque dimension et chaque mesure de la requête paraît dans
//    exactement une zone. Un champ qu'aucune zone n'affiche est un champ que l'utilisateur
//    croit absent — et qu'il ne peut ni retrouver, ni protéger.
// 2. **Rien n'est RECOMPOSÉ.** Les gestes sont des retouches ciblées de `query`, jamais une
//    reconstruction à partir des zones : ce que les zones ignorent (tri, limite, source, et
//    les autres zones) traverse chaque geste intact.
import { describe, it, expect } from 'vitest'
import { TILE_KINDS_FOR_TEST } from './wellFixture'
import { testSource } from './wellFixture'
import { wellChips, WELL_IDS, type WellId } from './wells'
import { dropInWell, removeFromWell, reorderWell, setChipAggregation, updateFilter } from './wellEdits'
import type { Tile, TileKind } from '../types'

/** Une tuile RICHE : deux axes, deux mesures, une info-bulle, un filtre, un tri, une limite.
 *  ⚠ `sort`/`limit` ne sont exposés par AUCUNE zone — c'est précisément pour ça qu'ils sont là. */
function richTile(kind: TileKind): Tile {
  return {
    id: 't1', kind, title: 'Riche',
    query: {
      source: 'pim.products',
      measures: [{ id: 'count' }, { field: 'price', agg: 'sum' }],
      dimensions: [{ id: 'brand' }, { id: 'price' }],
      tooltips: [{ field: 'price', agg: 'median' }],
      filters: [{ field: 'brand', op: 'notEmpty' }],
      sort: [{ by: 'count', dir: 'desc' }],
      limit: 50,
    },
    options: { pivotColumn: 'price' },
  }
}

/** Ce que les zones NE CONNAISSENT PAS et doivent donc laisser passer sans y toucher. */
const untouched = (t: Tile) => ({ source: t.query.source, sort: t.query.sort, limit: t.query.limit })

describe('les zones montrent TOUT ce que la tuile porte', () => {
  for (const kind of TILE_KINDS_FOR_TEST) {
    it(`« ${kind} » : chaque dimension et chaque mesure paraît dans exactement une zone`, () => {
      const tile = richTile(kind)
      const seen = new Map<string, WellId[]>()
      for (const well of WELL_IDS) {
        for (const chip of wellChips(well, tile, testSource)) {
          const key = `${well === 'axis' || well === 'legend' ? 'dim' : well === 'visualFilters' ? 'flt' : well}#${chip.index}`
          // ⚠ Axe et Légende puisent dans le MÊME tableau : on les compte ensemble, sinon un
          // rang porté deux fois passerait pour deux champs distincts.
          const bucket = key.startsWith('dim') ? key : `${well}#${chip.index}`
          seen.set(bucket, [...(seen.get(bucket) ?? []), well])
        }
      }
      // Les deux dimensions sont visibles, chacune une seule fois.
      expect([...seen.keys()].filter((k) => k.startsWith('dim')).sort()).toEqual(['dim#0', 'dim#1'])
      for (const [, wells] of seen) expect(wells).toHaveLength(1)
      // Les deux mesures aussi.
      expect(wellChips('values', tile, testSource).map((c) => c.index)).toEqual([0, 1])
      // Et l'info-bulle.
      expect(wellChips('tooltips', tile, testSource).map((c) => c.index)).toEqual([0])
    })
  }
})

describe('aucun geste ne recompose la requête', () => {
  const brand = { role: 'dimension' as const, id: 'brand', label: 'Marque' }

  it('un dépôt laisse INTACTS la source, le tri, la limite et les autres zones', () => {
    const before = richTile('table')
    const after = dropInWell(before, 'visualFilters', brand, testSource)
    expect(untouched(after)).toEqual(untouched(before))
    expect(after.query.dimensions).toEqual(before.query.dimensions)
    expect(after.query.measures).toEqual(before.query.measures)
    expect(after.query.tooltips).toEqual(before.query.tooltips)
  })

  it('un retrait ne touche QUE sa zone', () => {
    const before = richTile('bar')
    const after = removeFromWell(before, 'values', 1)
    expect(untouched(after)).toEqual(untouched(before))
    expect(after.query.dimensions).toEqual(before.query.dimensions)
    expect(after.query.tooltips).toEqual(before.query.tooltips)
    expect(after.query.filters).toEqual(before.query.filters)
  })

  it('un changement d’agrégation ne touche QUE sa puce', () => {
    const before = richTile('bar')
    const after = setChipAggregation(before, 'values', 1, 'avg')
    expect(untouched(after)).toEqual(untouched(before))
    expect(after.query.dimensions).toEqual(before.query.dimensions)
    expect(after.query.measures[0]).toEqual(before.query.measures[0])
    expect(after.query.tooltips).toEqual(before.query.tooltips)
  })

  it('une retouche de filtre ne touche QUE ce filtre', () => {
    const before = richTile('bar')
    const after = updateFilter(before, 0, { op: 'empty' })
    expect(untouched(after)).toEqual(untouched(before))
    expect(after.query.dimensions).toEqual(before.query.dimensions)
    expect(after.query.measures).toEqual(before.query.measures)
  })

  it('un réordonnancement SUR PLACE ne produit aucun changement', () => {
    const before = richTile('bar')
    expect(reorderWell(before, 'values', 1, 1)).toBe(before)
  })

  it('⚠⚠ AUCUN geste ne vide les dimensions d’une tuile qui en porte', () => {
    // Le défaut vu en production : `dimensions: []` sur une tuile qui devait en porter une.
    // Seuls le RETRAIT explicite de l'axe et le passage en indicateur ont ce droit.
    const before = richTile('bar')
    const gestes: Tile[] = [
      dropInWell(before, 'values', brand, testSource),
      dropInWell(before, 'visualFilters', brand, testSource),
      dropInWell(before, 'tooltips', brand, testSource),
      setChipAggregation(before, 'values', 1, 'avg'),
      updateFilter(before, 0, { op: 'empty' }),
      reorderWell(before, 'values', 0, 1),
      removeFromWell(before, 'values', 1),
      removeFromWell(before, 'tooltips', 0),
      removeFromWell(before, 'visualFilters', 0),
    ]
    for (const t of gestes) expect(t.query.dimensions.length).toBeGreaterThan(0)
  })

  it('⚠⚠ AUCUN geste n’ajoute une mesure que personne n’a demandée', () => {
    const before = richTile('bar')
    const sansEffetSurLesMesures: Tile[] = [
      dropInWell(before, 'axis', brand, testSource),
      dropInWell(before, 'visualFilters', brand, testSource),
      dropInWell(before, 'tooltips', brand, testSource),
      updateFilter(before, 0, { op: 'empty' }),
      removeFromWell(before, 'visualFilters', 0),
    ]
    for (const t of sansEffetSurLesMesures) {
      expect(t.query.measures).toEqual(before.query.measures)
    }
  })
})
