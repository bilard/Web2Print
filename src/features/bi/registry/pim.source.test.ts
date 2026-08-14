import { describe, it, expect } from 'vitest'
import { pimSource, productToRow } from './pim.source'
import { getSource } from './sources'
import { aggregate } from '../engine/aggregate'
import type { Product } from '@/features/pim/types'

const product = (id: string, fields: Record<string, unknown>): Product => ({
  _id: id, masterSku: id, masterEan: null, primarySourceId: 's1',
  fields: Object.fromEntries(Object.entries(fields)
    .map(([k, v]) => [k, { value: v as never, winningSourceId: 's1' }])),
  sourceLinks: [], taxonomyPath: ['Outillage', 'Perçage'], needsDedup: false,
  createdAt: 1, updatedAt: 2,
})

describe('source PIM', () => {
  it('aplatit un produit : champs, taxonomie et compteurs', () => {
    const row = productToRow(product('p1', { marque: 'Makita', prix: '199,90' }), ['marque', 'prix'])
    expect(row.marque).toBe('Makita')
    expect(row['taxo.1']).toBe('Outillage')
    expect(row._filled).toBe(2)
  })

  it('mesure la COMPLÉTUDE en pourcentage de champs renseignés', () => {
    const rows = [
      productToRow(product('p1', { a: 'x', b: 'y' }), ['a', 'b']),
      productToRow(product('p2', { a: 'x', b: '' }), ['a', 'b']),
    ]
    const m = pimSource.measures.find((x) => x.id === 'pim.completeness')!
    expect(m.compute(rows)).toBeCloseTo(75, 5)
    // ⚠ Une moyenne de pourcentages entre groupes est fausse : la mesure se déclare NON
    // agrégeable, et le constructeur refusera de l'additionner.
    expect(m.aggregable).toBe(false)
  })

  it('se branche au moteur sans adaptateur', () => {
    const rows = [
      productToRow(product('p1', { marque: 'Makita' }), ['marque']),
      productToRow(product('p2', { marque: 'Bosch' }), ['marque']),
    ]
    const r = aggregate(rows, {
      source: 'pim.products', measures: [{ id: 'count' }],
      dimensions: [{ id: 'taxo.1' }], filters: [],
    }, pimSource)
    expect(r.rows).toEqual([{ 'taxo.1': 'Outillage', count: 2 }])
  })

  it('résout une source par son identifiant, et lève sur un identifiant inconnu', () => {
    expect(getSource('pim.products').id).toBe('pim.products')
    expect(() => getSource('sql.libre' as never)).toThrow()
  })
})
