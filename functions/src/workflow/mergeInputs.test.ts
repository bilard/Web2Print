import { describe, it, expect } from 'vitest'
import { mergeInputValue } from './mergeInputs'

describe('mergeInputValue (fan-in)', () => {
  it('concatène les rows de deux sheets (cas concurrents multi-sites)', () => {
    const a = { columns: [{ key: 'site' }, { key: 'price' }], rows: [{ site: 'a', price: 1 }] }
    const b = { columns: [{ key: 'site' }, { key: 'price' }], rows: [{ site: 'b', price: 2 }] }
    const m = mergeInputValue(a, b) as { rows: unknown[]; columns: unknown[] }
    expect(m.rows).toHaveLength(2)
    expect(m.columns).toHaveLength(2) // colonnes identiques → pas de doublon
  })

  it('une sheet vide n’efface pas une sheet pleine (le bug Leroy Merlin)', () => {
    const full = { rows: [{ site: 'castorama', price: 9 }] }
    const empty = { rows: [] }
    expect((mergeInputValue(full, empty) as { rows: unknown[] }).rows).toHaveLength(1)
    expect((mergeInputValue(empty, full) as { rows: unknown[] }).rows).toHaveLength(1)
  })

  it('fait l’union des colonnes par key', () => {
    const a = { columns: [{ key: 'x' }], rows: [{ x: 1 }] }
    const b = { columns: [{ key: 'x' }, { key: 'y' }], rows: [{ x: 2, y: 3 }] }
    expect((mergeInputValue(a, b) as { columns: { key: string }[] }).columns.map((c) => c.key)).toEqual(['x', 'y'])
  })

  it('concatène deux arrays', () => {
    expect(mergeInputValue([1, 2], [3])).toEqual([1, 2, 3])
  })

  it('non-fusionnable → dernière valeur (comportement historique)', () => {
    expect(mergeInputValue('a', 'b')).toBe('b')
    expect(mergeInputValue({ foo: 1 }, { bar: 2 })).toEqual({ bar: 2 })
  })
})
