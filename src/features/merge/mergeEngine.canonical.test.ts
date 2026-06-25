import { describe, it, expect } from 'vitest'
import { getRowValue, variableMatchesColumn } from './mergeEngine'
import type { MergeRow, MergeColumn } from '@/stores/merge.store'

const columns: MergeColumn[] = [
  { key: 'Référence', label: 'Référence', fieldType: 'text' },
  { key: 'Nom du produit', label: 'Nom du produit', fieldType: 'text' },
]
const row: MergeRow = { _id: 'r0', 'Référence': 'A-1', 'Nom du produit': 'Chaise' }

describe('getRowValue — recours canonique (round-trip plugin InDesign)', () => {
  it('placeholder désaccentué résout la colonne accentuée', () => {
    // tag slug « Référence » reste accentué → match label exact ; on couvre aussi le cas désaccentué legacy
    expect(getRowValue(row, 'Reference', columns)).toBe('A-1')
  })
  it('placeholder à underscores résout le libellé à espaces', () => {
    expect(getRowValue(row, 'Nom_du_produit', columns)).toBe('Chaise')
  })
  it('le libellé accentué exact résout toujours', () => {
    expect(getRowValue(row, 'Référence', columns)).toBe('A-1')
  })
  it('variableMatchesColumn reconnaît la forme canonique', () => {
    expect(variableMatchesColumn('Nom_du_produit', columns)).toBe(true)
    expect(variableMatchesColumn('Reference', columns)).toBe(true)
  })
  it('ne matche pas une colonne sans rapport', () => {
    expect(getRowValue(row, 'Prix', columns)).toBeUndefined()
    expect(variableMatchesColumn('Prix', columns)).toBe(false)
  })
})
