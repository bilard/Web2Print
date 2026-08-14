import { describe, it, expect } from 'vitest'
import { pimRows, rowsFromSheet } from './rowsFromPim'
import type { Product } from '@/features/pim/types'
import type { ExcelColumn, ExcelSheet } from '@/features/excel/types'

const p = (id: string, fields: Record<string, string>): Product => ({
  _id: id, masterSku: id, masterEan: null, primarySourceId: 's',
  fields: Object.fromEntries(Object.entries(fields)
    .map(([k, v]) => [k, { value: v as never, winningSourceId: 's' }])),
  sourceLinks: [], taxonomyPath: [], needsDedup: false, createdAt: 0, updatedAt: 0,
})

describe('pimRows', () => {
  it('déduit les colonnes de TOUS les produits, pas seulement du premier', () => {
    // ⚠ Un produit sans le champ « poids » doit compter comme NON renseigné : si les
    // colonnes venaient du premier produit, la complétude serait surévaluée.
    const rows = pimRows([p('a', { marque: 'X' }), p('b', { marque: 'Y', poids: '2' })], [])
    expect(rows[0]._total).toBe(2)
    expect(rows[0]._filled).toBe(1)
  })

  it('respecte les colonnes imposées quand elles sont fournies', () => {
    const rows = pimRows([p('a', { marque: 'X', poids: '2' })], ['marque'])
    expect(rows[0]._total).toBe(1)
  })
})

const col = (key: string, label = key): ExcelColumn => ({
  key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160,
})

const sheet = (over: Partial<ExcelSheet> = {}): ExcelSheet => ({
  name: 'Feuille 1',
  columns: [col('marque'), col('poids')],
  rows: [],
  taxonomy: [],
  ...over,
})

describe('rowsFromSheet', () => {
  it('prend les colonnes de la feuille, avec la même règle de complétude que productToRow', () => {
    const s = sheet({
      rows: [
        { _id: 'a', marque: 'X', poids: '  ' }, // un espace seul ne compte pas comme rempli
        { _id: 'b', marque: 'Y', poids: '2' },
      ],
    })
    const rows = rowsFromSheet(s)
    expect(rows[0]._total).toBe(2)
    expect(rows[0]._filled).toBe(1)
    expect(rows[1]._filled).toBe(2)
  })

  it('reporte les niveaux de taxonomie déclarés sur la feuille, null pour les autres', () => {
    const s = sheet({
      columns: [col('marque'), col('univers')],
      rows: [{ _id: 'a', marque: 'X', univers: 'Outillage' }],
      taxonomyLevels: { univers: 1 },
    })
    const rows = rowsFromSheet(s)
    expect(rows[0]['taxo.1']).toBe('Outillage')
    expect(rows[0]['taxo.2']).toBeNull()
  })

  it('sans taxonomie déclarée, tous les niveaux sont null', () => {
    const rows = rowsFromSheet(sheet({ rows: [{ _id: 'a', marque: 'X' }] }))
    expect(rows[0]['taxo.1']).toBeNull()
  })
})
