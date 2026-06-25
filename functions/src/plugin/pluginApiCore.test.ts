import { describe, it, expect } from 'vitest'
import {
  hashToken, parseRoute, projectDataset, firstSheetColumns, projectRow,
} from './pluginApiCore'

describe('hashToken', () => {
  it('est déterministe et en hex sha256 (64 chars)', () => {
    const h = hashToken('w2p_abc')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken('w2p_abc')).toBe(h)
  })
  it('diffère pour des tokens différents', () => {
    expect(hashToken('w2p_a')).not.toBe(hashToken('w2p_b'))
  })
})

describe('parseRoute', () => {
  it('liste', () => expect(parseRoute('/datasets')).toEqual({ kind: 'list' }))
  it('colonnes', () => expect(parseRoute('/datasets/abc')).toEqual({ kind: 'columns', docId: 'abc' }))
  it('ligne', () => expect(parseRoute('/datasets/abc/row')).toEqual({ kind: 'row', docId: 'abc' }))
  it('tolère un slash final', () => expect(parseRoute('/datasets/')).toEqual({ kind: 'list' }))
  it('inconnu', () => expect(parseRoute('/nope')).toEqual({ kind: 'unknown' }))
})

describe('projectDataset', () => {
  it('projette les métadonnées', () => {
    expect(projectDataset('d1', { fileName: 'Catalogue', sheetCount: 2, totalRows: 120 }))
      .toEqual({ docId: 'd1', fileName: 'Catalogue', sheetCount: 2, rowCount: 120 })
  })
  it('tolère les champs manquants', () => {
    expect(projectDataset('d1', {})).toEqual({ docId: 'd1', fileName: 'd1', sheetCount: 0, rowCount: 0 })
  })
})

const sheets = [{
  columns: [
    { key: 'ref', label: 'Référence', fieldType: 'text' },
    { key: 'prix', label: 'Prix', fieldType: 'currency' },
  ],
  rows: [
    { _id: 'r0', ref: 'A-1', prix: 9.9 },
    { _id: 'r1', ref: 'B-2', prix: null },
  ],
}]

describe('firstSheetColumns', () => {
  it('mappe key/label/fieldType de la 1re feuille', () => {
    expect(firstSheetColumns(sheets)).toEqual([
      { key: 'ref', label: 'Référence', fieldType: 'text' },
      { key: 'prix', label: 'Prix', fieldType: 'currency' },
    ])
  })
  it('feuilles vides → []', () => expect(firstSheetColumns([])).toEqual([]))
})

describe('projectRow', () => {
  it('résout les valeurs par colonne, en string', () => {
    expect(projectRow(sheets, 0)).toEqual({
      rowIndex: 0, total: 2,
      values: [
        { key: 'ref', label: 'Référence', value: 'A-1' },
        { key: 'prix', label: 'Prix', value: '9.9' },
      ],
    })
  })
  it('null/undefined → chaîne vide', () => {
    expect(projectRow(sheets, 1).values[1]).toEqual({ key: 'prix', label: 'Prix', value: '' })
  })
  it("clamp l'index hors borne", () => {
    expect(projectRow(sheets, 99).rowIndex).toBe(1)
    expect(projectRow(sheets, -5).rowIndex).toBe(0)
  })
  it('aucune ligne → values vide', () => {
    expect(projectRow([{ columns: sheets[0].columns, rows: [] }], 0))
      .toEqual({ rowIndex: 0, total: 0, values: [] })
  })
})
