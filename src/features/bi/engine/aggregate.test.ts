import { describe, it, expect } from 'vitest'
import { aggregate } from './aggregate'
import type { DataSource, Row } from '../registry/types'
import type { QuerySpec } from '../types'

const source: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [
    { id: 'brand', labelKey: 'bi.dim.brand', kind: 'text', get: (r) => r.brand },
    { id: 'createdAt', labelKey: 'bi.dim.createdAt', kind: 'date', get: (r) => r.createdAt },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
      compute: (rows) => rows.length },
    { id: 'sum:price', labelKey: 'bi.measure.price', format: 'eur', aggregable: true,
      compute: (rows) => rows.reduce((n, r) => n + Number(r.price ?? 0), 0) },
    { id: 'median:price', labelKey: 'bi.measure.medianPrice', format: 'eur', aggregable: false,
      compute: (rows) => {
        const v = rows.map((r) => Number(r.price ?? 0)).sort((a, b) => a - b)
        return v.length ? v[Math.floor(v.length / 2)] : 0
      } },
  ],
}

const rows: Row[] = [
  { brand: 'Makita', price: 100, createdAt: Date.UTC(2026, 0, 5) },
  { brand: 'Makita', price: 300, createdAt: Date.UTC(2026, 0, 20) },
  { brand: 'Bosch',  price: 50,  createdAt: Date.UTC(2026, 1, 3) },
  { brand: null,     price: 10,  createdAt: Date.UTC(2026, 1, 4) },
]

const q = (p: Partial<QuerySpec>): QuerySpec => ({
  source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [], ...p,
})

describe('aggregate', () => {
  it('sans dimension, rend UNE ligne de totaux', () => {
    const r = aggregate(rows, q({ measures: [{ id: 'count' }, { id: 'sum:price' }] }), source)
    expect(r.rows).toEqual([{ count: 4, 'sum:price': 460 }])
  })

  it('groupe par dimension et trie par mesure décroissante', () => {
    const r = aggregate(rows, q({
      dimensions: [{ id: 'brand' }], measures: [{ id: 'sum:price' }],
      sort: [{ by: 'sum:price', dir: 'desc' }],
    }), source)
    expect(r.rows.map((x) => x.brand)).toEqual(['Makita', 'Bosch', null])
    expect(r.rows[0]['sum:price']).toBe(400)
  })

  it('garde les valeurs ABSENTES dans leur propre groupe, jamais fondues dans une autre', () => {
    // ⚠ Regrouper `null` avec « Bosch » ou l'écarter en silence fausserait le total : la
    // somme des groupes ne vaudrait plus le total général.
    const r = aggregate(rows, q({ dimensions: [{ id: 'brand' }], measures: [{ id: 'count' }] }), source)
    const total = r.rows.reduce((n, x) => n + Number(x.count), 0)
    expect(total).toBe(rows.length)
  })

  it('regroupe une dimension de temps par mois', () => {
    const r = aggregate(rows, q({
      dimensions: [{ id: 'createdAt', bucket: 'month' }], measures: [{ id: 'count' }],
    }), source)
    expect(r.rows.map((x) => x.createdAt)).toEqual(['2026-01', '2026-02'])
    expect(r.rows.map((x) => x.count)).toEqual([2, 2])
  })

  it('applique les filtres AVANT de grouper', () => {
    const r = aggregate(rows, q({
      filters: [{ field: 'brand', op: 'eq', value: 'Makita' }], measures: [{ id: 'count' }],
    }), source)
    expect(r.rows).toEqual([{ count: 2 }])
  })

  it('rend un résultat VIDE sans lever quand aucune ligne ne passe', () => {
    const r = aggregate(rows, q({ filters: [{ field: 'brand', op: 'eq', value: 'Absent' }] }), source)
    expect(r.rows).toEqual([])
    expect(r.columns.length).toBeGreaterThan(0)
  })

  it('lève sur une mesure inconnue plutôt que de rendre zéro', () => {
    // ⚠⚠ Un zéro silencieux est le pire résultat possible : il se lit comme une donnée.
    expect(() => aggregate(rows, q({ measures: [{ id: 'sum:inexistant' }] }), source)).toThrow(/inconnue/i)
  })

  it('calcule une mesure NON AGRÉGEABLE sur les lignes du groupe, jamais par recomposition', () => {
    // La médiane d'un groupe ne se déduit pas des médianes de ses sous-groupes.
    const r = aggregate(rows, q({
      dimensions: [{ id: 'brand' }], measures: [{ id: 'median:price' }],
    }), source)
    expect(r.rows.find((x) => x.brand === 'Makita')?.['median:price']).toBe(300)
  })
})
