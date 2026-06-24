import { describe, it, expect } from 'vitest'
import { getRowValue, resolveText, variableMatchesColumn } from './mergeEngine'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

const COLS: MergeColumn[] = [
  { key: 'col_offre', label: 'Offre complémentaire', fieldType: 'text' },
  { key: 'col_lib', label: 'Désignation', fieldType: 'text' },
]
const ROW: MergeRow = { _id: 'r1', col_offre: '+55g GRATUIT', col_lib: 'Parure de lit' }

describe('fieldMap (mapping explicite balise→colonne)', () => {
  it('getRowValue : fieldMap a priorité absolue', () => {
    // sans mapping : aucune colonne ne matche "Free_complement" → undefined (devinage échoue)
    expect((getRowValue as any)(ROW, 'Free_complement', COLS)).toBeUndefined()
    // avec mapping explicite → valeur de la colonne mappée
    expect((getRowValue as any)(ROW, 'Free_complement', COLS, { Free_complement: 'col_offre' }))
      .toBe('+55g GRATUIT')
  })
  it('resolveText utilise le fieldMap', () => {
    const out = (resolveText as any)('{{Free_complement}}', ROW, undefined, undefined, undefined, COLS,
      { Free_complement: 'col_offre' })
    expect(out).toBe('+55g GRATUIT')
  })
  it('variableMatchesColumn reconnaît une balise mappée vers une colonne existante', () => {
    expect((variableMatchesColumn as any)('Free_complement', COLS)).toBe(false)
    expect((variableMatchesColumn as any)('Free_complement', COLS, { Free_complement: 'col_offre' }))
      .toBe(true)
  })
  it('repli : balise non mappée garde le devinage par label', () => {
    expect((getRowValue as any)(ROW, 'Désignation', COLS, { Free_complement: 'col_offre' }))
      .toBe('Parure de lit')
  })
})
