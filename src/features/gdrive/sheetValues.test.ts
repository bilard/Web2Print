// Parité du nommage de colonnes entre les DEUX chemins de lecture d'un Google Sheet
// (export XLSX via SheetJS, et API `values`). Un écart ici ne casse rien visiblement : il
// fait simplement perdre à « Comparer catalogue » sa colonne de référence, donc tous ses
// appariements, selon le chemin emprunté.
import { describe, it, expect } from 'vitest'
import { sheetKeysFromHeader, matrixToSheet } from './sheetValues'

describe('sheetKeysFromHeader', () => {
  it('garde l’en-tête comme clé', () => {
    expect(sheetKeysFromHeader(['ARTICLECODE', 'EAN', 'UNIVERS'])).toEqual(['ARTICLECODE', 'EAN', 'UNIVERS'])
  })
  it('suffixe les doublons comme sheet_to_json', () => {
    expect(sheetKeysFromHeader(['REF', 'REF', 'REF'])).toEqual(['REF', 'REF_1', 'REF_2'])
  })
  it('nomme les en-têtes vides __EMPTY, __EMPTY_1…', () => {
    expect(sheetKeysFromHeader(['A', '', '  ', null])).toEqual(['A', '__EMPTY', '__EMPTY_1', '__EMPTY_2'])
  })
})

describe('matrixToSheet', () => {
  const matrix = [
    ['ARTICLECODE', 'PV Brut F1', 'UNIVERS'],
    ['ABC-1', 12.4, 'Jardin'],
    ['', '', ''],
    ['ABC-2', 9, 'Jardin'],
  ]

  it('bâtit colonnes et lignes, en ignorant les lignes entièrement vides', () => {
    const sheet = matrixToSheet(matrix, 'Feuille 1')
    expect(sheet.columns.map((c) => c.key)).toEqual(['ARTICLECODE', 'PV Brut F1', 'UNIVERS'])
    expect(sheet.rows).toHaveLength(2)
    expect(sheet.rows[1]).toMatchObject({ ARTICLECODE: 'ABC-2', 'PV Brut F1': 9 })
  })

  it('garde les NOMBRES en nombres — un prix lu en texte viderait toutes les comparaisons', () => {
    expect(matrixToSheet(matrix, 'x').rows[0]['PV Brut F1']).toBe(12.4)
  })

  it('comble les cellules absentes en fin de ligne (l’API tronque les vides)', () => {
    const sheet = matrixToSheet([['A', 'B', 'C'], ['x']], 'x')
    expect(sheet.rows[0]).toMatchObject({ A: 'x', B: null, C: null })
  })
})
