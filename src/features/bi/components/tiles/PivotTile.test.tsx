// ⚠⚠ Deux défauts couverts ici :
// - une mesure NON AGRÉGEABLE (complétude, médiane) ne se somme pas entre groupes : les
//   totaux affichaient « 312 % », un chiffre que rien ne justifie ;
// - `pivotColumn` désignant la PREMIÈRE dimension laissait `rowCol` introuvable — le
//   composant tombait sur un `undefined.key`.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PivotTile } from './PivotTile'
import type { AggregateResult } from '../../engine/aggregate'

const build = (aggregable: boolean): AggregateResult => ({
  columns: [
    { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
    { key: 'family', labelKey: 'bi.dim.taxo2', role: 'dimension' },
    aggregable
      ? { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int', aggregable: true }
      : { key: 'pim.completeness', labelKey: 'bi.measure.completeness', role: 'measure', format: 'pct', aggregable: false },
  ],
  rows: aggregable
    ? [
      { brand: 'Makita', family: 'Perçage', count: 3 },
      { brand: 'Bosch', family: 'Perçage', count: 5 },
    ]
    : [
      { brand: 'Makita', family: 'Perçage', 'pim.completeness': 100 },
      { brand: 'Bosch', family: 'Perçage', 'pim.completeness': 100 },
    ],
})

describe('PivotTile', () => {
  it('somme les totaux d’une mesure agrégeable', () => {
    render(<PivotTile result={build(true)} />)
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    // Total de colonne ET total général valent 3 + 5 : les deux sont affichés.
    expect(screen.getAllByText('8')).toHaveLength(2)
  })

  it('n’affiche AUCUN total pour une mesure non agrégeable — ni ligne, ni colonne, ni général', () => {
    render(<PivotTile result={build(false)} />)
    expect(screen.queryByText('Total')).toBeNull()
    // Et le tableau reste d'aplomb : autant de cellules que d'en-têtes.
    const headers = screen.getAllByRole('columnheader')
    const firstRow = screen.getAllByRole('row')[1]
    expect(firstRow.querySelectorAll('td')).toHaveLength(headers.length)
  })

  it('`showTotals: false` retire aussi les totaux d’une mesure pourtant agrégeable', () => {
    render(<PivotTile result={build(true)} showTotals={false} />)
    expect(screen.queryByText('Total')).toBeNull()
  })

  it('une colonne désignant l’axe des LIGNES ne fait pas tomber le composant', () => {
    // Sans garde : `dims.find((d) => d.key !== colDim)` rendait `undefined`, puis `.key` levait.
    expect(() => render(<PivotTile result={build(true)} columnDim="brand" />)).not.toThrow()
  })
})
