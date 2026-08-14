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

// ⚠⚠ Une colonne homonyme d'une clé du moteur produisait une complétude FAUSSE sans bruit :
// `_filled`/`_total`/`taxo.N` sont posés APRÈS la copie des colonnes, `_id` avant. Dans les
// deux sens, la mesure ment. On refuse la ligne plutôt que de la mesurer de travers.
describe('clés réservées', () => {
  it('refuse une colonne de feuille nommée `_total` — sinon la complétude serait fausse', () => {
    const s = sheet({
      columns: [col('marque'), col('_total')],
      rows: [{ _id: 'a', marque: 'X', _total: '999' }],
    })
    expect(() => rowsFromSheet(s)).toThrow(/_total/)
  })

  it('refuse aussi `_filled`, `_id` et un niveau de taxonomie', () => {
    for (const key of ['_filled', '_id', 'taxo.2']) {
      expect(() => rowsFromSheet(sheet({ columns: [col(key)] }))).toThrow(/réservée/)
    }
  })

  it('nomme la colonne fautive : un refus muet ne se corrige pas', () => {
    expect(() => rowsFromSheet(sheet({ columns: [col('_sku')] }))).toThrow(/_sku/)
  })

  it('vaut aussi pour le catalogue master (productToRow via pimRows)', () => {
    expect(() => pimRows([p('a', { _total: '3' })], [])).toThrow(/réservée/)
  })

  it('laisse passer une colonne au nom simplement proche', () => {
    expect(() => rowsFromSheet(sheet({ columns: [col('total'), col('taxo.5')] }))).not.toThrow()
  })
})
