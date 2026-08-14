import { describe, it, expect } from 'vitest'
import { pimRows, rowsFromSheet } from './rowsFromPim'
import { BiKeyedError } from '../types'
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

/** Colonne fautive rapportée par l'erreur — `undefined` si l'appel n'a pas levé. */
function reservedColumnOf(run: () => unknown): string | undefined {
  try {
    run()
    return undefined
  } catch (e) {
    if (!(e instanceof BiKeyedError)) throw e
    expect(e.messageKey).toBe('bi.error.reservedColumn')
    return typeof e.params?.column === 'string' ? e.params.column : undefined
  }
}

// ⚠⚠ Une colonne homonyme d'une clé du moteur produisait une complétude FAUSSE sans bruit :
// `_filled`/`_total`/`taxo.N` sont posés APRÈS la copie des colonnes, `_id` avant. Dans les
// deux sens, la mesure ment. On refuse la ligne plutôt que de la mesurer de travers.
describe('clés réservées', () => {
  it('refuse une colonne de feuille nommée `_total` — sinon la complétude serait fausse', () => {
    const s = sheet({
      columns: [col('marque'), col('_total')],
      rows: [{ _id: 'a', marque: 'X', _total: '999' }],
    })
    // ⚠ La CLÉ et son paramètre, jamais la phrase : ce module est pur, il ne traduit pas.
    expect(() => rowsFromSheet(s)).toThrow(BiKeyedError)
    expect(reservedColumnOf(() => rowsFromSheet(s))).toBe('_total')
  })

  it('refuse aussi `_filled`, `_id` et un niveau de taxonomie', () => {
    for (const key of ['_filled', '_id', 'taxo.2']) {
      expect(reservedColumnOf(() => rowsFromSheet(sheet({ columns: [col(key)] })))).toBe(key)
    }
  })

  it('nomme la colonne fautive : un refus muet ne se corrige pas', () => {
    expect(reservedColumnOf(() => rowsFromSheet(sheet({ columns: [col('taxo.1')] })))).toBe('taxo.1')
  })

  it('vaut aussi pour le catalogue master (productToRow via pimRows)', () => {
    expect(reservedColumnOf(() => pimRows([p('a', { _total: '3' })], []))).toBe('_total')
  })

  // ⚠⚠ Les deux chemins ne réservent PAS les mêmes clés : `rowsFromSheet` ne pose ni `_sku`
  // ni `_createdAt` ni `_updatedAt`, une colonne qui les porterait ne corromprait donc rien.
  // Les réserver côté feuille ferait échouer TOUTES ses tuiles pour une corruption impossible.
  // Côté produits, en revanche, `productToRow` les pose ET `pimSource` les expose en
  // dimensions : elles y sont légitimement interdites.
  it('`_sku` passe côté FEUILLE — la feuille ne pose jamais cette clé', () => {
    const s = sheet({ columns: [col('marque'), col('_sku')], rows: [{ _id: 'a', marque: 'X', _sku: 'REF-1' }] })
    expect(() => rowsFromSheet(s)).not.toThrow()
    expect(rowsFromSheet(s)[0]._sku).toBe('REF-1') // la valeur de la feuille survit
  })

  it('`_createdAt` et `_updatedAt` aussi : ce sont des notions de PRODUIT, pas de feuille', () => {
    for (const key of ['_createdAt', '_updatedAt']) {
      expect(() => rowsFromSheet(sheet({ columns: [col(key)] }))).not.toThrow()
    }
  })

  it('mais `_sku` ÉCHOUE côté catalogue master — `productToRow` le pose et le PIM l’expose', () => {
    expect(reservedColumnOf(() => pimRows([p('a', { _sku: 'REF-1' })], []))).toBe('_sku')
  })

  it('laisse passer une colonne au nom simplement proche', () => {
    expect(() => rowsFromSheet(sheet({ columns: [col('total'), col('taxo.5')] }))).not.toThrow()
  })
})
