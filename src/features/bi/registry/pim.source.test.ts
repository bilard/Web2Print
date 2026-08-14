import { describe, it, expect } from 'vitest'
import { pimSource, pimSourceFromSheet, productToRow } from './pim.source'
import { getSource } from './sources'
import { aggregate } from '../engine/aggregate'
import type { Product } from '@/features/pim/types'
import type { ExcelColumn, ExcelSheet } from '@/features/excel/types'

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

const excelCol = (key: string, fieldType: ExcelColumn['fieldType'], label = key): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width: 160,
})

describe('pimSourceFromSheet', () => {
  it('déduit le type de dimension depuis le fieldType déclaré de la colonne', () => {
    const sheet: ExcelSheet = {
      name: 'Feuille 1',
      columns: [
        excelCol('prix', 'currency', 'Prix'),
        excelCol('sortie', 'date', 'Date de sortie'),
        excelCol('actif', 'checkbox', 'Actif'),
        excelCol('marque', 'text', 'Marque'),
      ],
      rows: [], taxonomy: [],
    }
    const source = pimSourceFromSheet(sheet)
    const kindOf = (id: string) => source.dimensions.find((d) => d.id === id)?.kind
    expect(kindOf('prix')).toBe('number')
    expect(kindOf('sortie')).toBe('date')
    expect(kindOf('actif')).toBe('bool')
    expect(kindOf('marque')).toBe('text')
    // ⚠ Le libellé vient de la DONNÉE (la colonne), pas du catalogue i18n.
    expect(source.dimensions.find((d) => d.id === 'prix')?.label).toBe('Prix')
  })

  it("n'expose ni les dimensions de date ni la mesure d'ancienneté : une feuille n'a pas cette notion", () => {
    const source = pimSourceFromSheet({ name: 'F', columns: [], rows: [], taxonomy: [] })
    expect(source.dimensions.some((d) => d.id === '_createdAt' || d.id === '_updatedAt')).toBe(false)
    expect(source.measures.some((m) => m.id === 'pim.freshnessDays')).toBe(false)
    // Les mesures de complétude, elles, restent valables sur une feuille.
    expect(source.measures.some((m) => m.id === 'pim.completeness')).toBe(true)
  })

  it('sans feuille active (null), ne garde que les dimensions fixes', () => {
    const source = pimSourceFromSheet(null)
    expect(source.dimensions.every((d) => d.id.startsWith('taxo.'))).toBe(true)
  })
})
