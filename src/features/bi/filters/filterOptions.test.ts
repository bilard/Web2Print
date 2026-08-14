// ⚠ Ce que ces tests protègent : un filtre qui propose des valeurs absentes des données,
// une puce qui tait ce qu'elle restreint, et un clic croisé qui empile des conditions au
// lieu de changer de valeur — trois façons de faire mentir un chiffre à l'écran.
import { describe, it, expect } from 'vitest'
import {
  filterOptions, numericRange, describeFilter, upsertFilter, removeFilter, toggleCrossFilter,
} from './filterOptions'
import type { Dimension, Row } from '../registry/types'

const brand: Dimension = {
  id: 'brand', labelKey: 'bi.dim.brand', kind: 'text', get: (r) => r.brand,
}
const price: Dimension = {
  id: 'price', labelKey: 'bi.measure.price', kind: 'number', get: (r) => r.price,
}

const rows: Row[] = [
  { brand: 'Makita', price: 100 },
  { brand: 'Makita', price: 300 },
  { brand: 'Bosch', price: 50 },
  { brand: '', price: 'n/a' },
  { brand: null, price: null },
]

describe('filterOptions', () => {
  it('propose les valeurs RÉELLEMENT présentes, les plus fréquentes d’abord', () => {
    const { options, truncated } = filterOptions(rows, brand)
    expect(options.map((o) => o.value)).toEqual(['Makita', null, 'Bosch'])
    expect(options[0]).toEqual({ value: 'Makita', count: 2 })
    expect(truncated).toBe(false)
  })

  it('range les valeurs ABSENTES dans une option à part, jamais fondues ni masquées', () => {
    // ⚠ « sans marque » est une question légitime, et la somme des effectifs doit valoir
    // le nombre de lignes — sinon le filtre ment sur ce qu'il couvre.
    const { options } = filterOptions(rows, brand)
    const total = options.reduce((n, o) => n + o.count, 0)
    expect(total).toBe(rows.length)
    expect(options.find((o) => o.value === null)?.count).toBe(2)
  })

  it('DIT quand la liste est tronquée', () => {
    const many: Row[] = Array.from({ length: 12 }, (_, i) => ({ brand: `M${i}` }))
    const { options, truncated } = filterOptions(many, brand, 5)
    expect(options).toHaveLength(5)
    expect(truncated).toBe(true)
  })
})

describe('numericRange', () => {
  it('ignore ce qui n’est pas un nombre', () => {
    expect(numericRange(rows, price)).toEqual({ min: 50, max: 300 })
  })

  it('rend null quand aucune valeur n’est numérique — pas une plage inventée', () => {
    expect(numericRange([{ price: 'n/a' }, { price: null }], price)).toBeNull()
  })
})

describe('describeFilter', () => {
  it('dit le champ ET la valeur', () => {
    expect(describeFilter({ field: 'brand', op: 'eq', value: 'Makita' }, 'Marque'))
      .toBe('Marque : Makita')
    expect(describeFilter({ field: 'price', op: 'between', value: [5, 50] }, 'Prix'))
      .toBe('Prix : 5 – 50')
  })

  it('compte au lieu d’étaler au-delà de trois valeurs', () => {
    expect(describeFilter({ field: 'b', op: 'in', value: ['a', 'b', 'c', 'd'] }, 'Marque'))
      .toBe('Marque : 4 valeurs')
  })

  it('nomme l’absence sans jargon', () => {
    expect(describeFilter({ field: 'b', op: 'empty' }, 'Marque')).toBe('Marque : non renseigné')
  })
})

describe('composition des filtres', () => {
  it('REMPLACE un filtre de même champ et même opérateur au lieu d’empiler', () => {
    // ⚠ Deux `eq` sur le même champ ne laisseraient plus aucune ligne : au second clic
    // croisé, l'utilisateur veut changer de valeur, pas ajouter une condition.
    const a = upsertFilter([], { field: 'brand', op: 'eq', value: 'Makita' })
    const b = upsertFilter(a, { field: 'brand', op: 'eq', value: 'Bosch' })
    expect(b).toEqual([{ field: 'brand', op: 'eq', value: 'Bosch' }])
  })

  it('garde les filtres d’autres champs et d’autres opérateurs', () => {
    const base = [
      { field: 'price', op: 'gte' as const, value: 10 },
      { field: 'brand', op: 'contains' as const, value: 'Mak' },
    ]
    const next = upsertFilter(base, { field: 'brand', op: 'eq', value: 'Bosch' })
    expect(next).toHaveLength(3)
  })

  it('le clic croisé est réversible : re-cliquer la même valeur retire le filtre', () => {
    const on = toggleCrossFilter([], 'brand', 'Makita')
    expect(on).toEqual([{ field: 'brand', op: 'eq', value: 'Makita' }])
    expect(toggleCrossFilter(on, 'brand', 'Makita')).toEqual([])
    expect(toggleCrossFilter(on, 'brand', 'Bosch'))
      .toEqual([{ field: 'brand', op: 'eq', value: 'Bosch' }])
  })

  it('retire un filtre par son champ et son opérateur', () => {
    const base = [
      { field: 'brand', op: 'eq' as const, value: 'Makita' },
      { field: 'brand', op: 'contains' as const, value: 'Mak' },
    ]
    expect(removeFilter(base, 'brand', 'eq')).toEqual([base[1]])
  })
})
