import { describe, it, expect } from 'vitest'
import { rejectionParts } from './violationSummary'

describe('rejectionParts', () => {
  it('nomme le motif et l’élément en cause', () => {
    expect(rejectionParts([{ kind: 'ref-lost', token: '751-12265' }]))
      .toEqual([{ key: 'pwte.reject.ref', token: '751-12265' }])
  })

  it('dédoublonne : trois cotes perdues = UN motif, pas trois lignes', () => {
    const out = rejectionParts([
      { kind: 'number-lost', token: '510 mm' },
      { kind: 'number-lost', token: '13 x 500' },
      { kind: 'number-lost', token: '6 mm' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].token).toBe('510 mm')
  })

  it('conserve des motifs DIFFÉRENTS, dans l’ordre d’apparition', () => {
    const out = rejectionParts([
      { kind: 'number-lost', token: '510 mm' },
      { kind: 'ref-lost', token: 'AB12' },
      { kind: 'brand-added', token: 'Makita' },
    ])
    expect(out.map((x) => x.key)).toEqual(['pwte.reject.number', 'pwte.reject.ref', 'pwte.reject.brandAdded'])
  })

  it('aucune violation → rien à afficher', () => {
    expect(rejectionParts([])).toEqual([])
  })
})
