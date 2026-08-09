import { describe, it, expect } from 'vitest'
import { stableId } from '../core'
import { revisionKeyOf } from './revisionLookup'

const map = (...keys: string[]) => new Map(keys.map((k) => [k, {}]))

describe('revisionKeyOf', () => {
  it('trouve la réécriture faite depuis l’écran, rangée sous l’identifiant du produit', () => {
    expect(revisionKeyOf(map('a-100'), { id: 'a-100', ref: 'A-100' })).toBe('a-100')
  })

  // ⚠ Le cas normal : « Comparer catalogue » pose `stableId(référence)` comme identifiant,
  // la carte de workflow clefe sur la même référence. Les deux chemins tombent sur la même
  // chaîne — c'est ce qui rend la réconciliation invisible.
  it('les deux chemins retombent sur la même clé quand le produit a une référence', () => {
    const p = { id: stableId('A-100'), ref: 'A-100' }
    expect(revisionKeyOf(map(stableId('A-100')), p)).toBe(p.id)
  })

  it('retrouve une réécriture clefée sur la référence quand l’identité du catalogue diffère', () => {
    const found = revisionKeyOf(map(stableId('REF/42')), { id: 'nom-du-produit', ref: 'REF/42' })
    expect(found).toBe(stableId('REF/42'))
  })

  it('essaie aussi le code-barres', () => {
    expect(revisionKeyOf(map('3660001'), { id: 'x', ref: '', ean: '3660001' })).toBe('3660001')
  })

  it('ne rend rien plutôt que la réécriture d’un autre produit', () => {
    expect(revisionKeyOf(map('b-200'), { id: 'a-100', ref: 'A-100', ean: '366' })).toBeUndefined()
  })
})
