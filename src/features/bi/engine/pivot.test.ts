import { describe, it, expect } from 'vitest'
import { toPivot } from './pivot'
import type { AggregateResult } from './aggregate'

const result: AggregateResult = {
  columns: [
    { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
    // ⚠ `bi.dim.taxo2` ("Famille") : `toPivot` est pur et ignore `labelKey`, mais le
    // catalogue i18n n'a pas de clé dédiée — celle-ci est la plus proche sémantiquement.
    { key: 'family', labelKey: 'bi.dim.taxo2', role: 'dimension' },
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ],
  rows: [
    { brand: 'Makita', family: 'Perçage', count: 3 },
    { brand: 'Makita', family: 'Sciage', count: 2 },
    { brand: 'Bosch',  family: 'Perçage', count: 5 },
  ],
}

describe('toPivot', () => {
  it('croise deux dimensions et totalise les deux axes', () => {
    const p = toPivot(result, 'brand', 'family', 'count')
    expect(p.columns).toEqual(['Perçage', 'Sciage'])
    expect(p.rows.find((r) => r.key === 'Makita')?.cells).toEqual([3, 2])
    expect(p.rows.find((r) => r.key === 'Bosch')?.cells).toEqual([5, null])
    expect(p.columnTotals).toEqual([8, 2])
    expect(p.grandTotal).toBe(10)
  })

  it('laisse une cellule ABSENTE vide au lieu d’y écrire zéro', () => {
    // ⚠ « Bosch × Sciage » n'a pas été mesuré : ce n'est pas la même chose que zéro produit.
    const p = toPivot(result, 'brand', 'family', 'count')
    expect(p.rows.find((r) => r.key === 'Bosch')?.cells[1]).toBeNull()
  })
})
