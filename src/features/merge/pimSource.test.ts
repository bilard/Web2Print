// src/features/merge/pimSource.test.ts
import { describe, it, expect } from 'vitest'
import { isPimSource, pimProjectIdFromSource, makePimSourceRef } from './pimSource'

describe('pimSource refs', () => {
  it('makePimSourceRef construit une ref préfixée pim: avec libellé lisible', () => {
    const ref = makePimSourceRef('proj-42', 'Catalogue Été')
    expect(ref).toEqual({ excelDocId: 'pim:proj-42', sheetIndex: 0, fileName: 'PIM · Catalogue Été' })
  })

  it('isPimSource distingue les refs PIM des datasets Excel', () => {
    expect(isPimSource(makePimSourceRef('p1', 'X'))).toBe(true)
    expect(isPimSource({ excelDocId: 'abc123', sheetIndex: 0, fileName: 'data.xlsx' })).toBe(false)
  })

  it('pimProjectIdFromSource retourne l’id du projet', () => {
    expect(pimProjectIdFromSource(makePimSourceRef('proj-42', 'X'))).toBe('proj-42')
  })
})
