import { describe, it, expect } from 'vitest'
import { pimRows } from './rowsFromPim'
import type { Product } from '@/features/pim/types'

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
