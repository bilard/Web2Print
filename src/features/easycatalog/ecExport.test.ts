// src/features/easycatalog/ecExport.test.ts
import { describe, it, expect } from 'vitest'
import { ecTypeFor, imageFileName, resolveKeyInfo } from './ecExport'
import { buildCsv } from './ecExport'
import { buildEcFieldNames } from './ecFieldName'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'

function col(key: string, label: string, extra: Partial<ExcelColumn> = {}): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120, ...extra }
}
function sheet(columns: ExcelColumn[], rows: ExcelRow[]): ExcelSheet {
  return { name: 'S', columns, rows, taxonomy: [] }
}

describe('ecTypeFor', () => {
  it('mappe les types numériques', () => {
    expect(ecTypeFor('number')).toBe('numeric')
    expect(ecTypeFor('currency')).toBe('numeric')
    expect(ecTypeFor('percent')).toBe('numeric')
    expect(ecTypeFor('rating')).toBe('numeric')
  })
  it('mappe image et le reste', () => {
    expect(ecTypeFor('image')).toBe('image')
    expect(ecTypeFor('text')).toBe('alphanumeric')
    expect(ecTypeFor('email')).toBe('alphanumeric')
  })
})

describe('imageFileName', () => {
  it('extrait le nom depuis une URL Firebase encodée', () => {
    expect(imageFileName('https://x/o/images%2Fabc.png?alt=media&token=z')).toBe('abc.png')
  })
  it('gère un chemin simple', () => {
    expect(imageFileName('/path/to/photo.jpg')).toBe('photo.jpg')
  })
  it('renvoie vide pour une entrée vide', () => {
    expect(imageFileName('')).toBe('')
  })
})

describe('resolveKeyInfo', () => {
  it('utilise la colonne primaire si unique et non vide', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true }), col('n', 'Nom')]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1', n: 'x' },
      { _id: 'r1', sku: 'A2', n: 'y' },
    ])
    const info = resolveKeyInfo(s, buildEcFieldNames(cols))
    expect(info).toEqual({ keyName: 'SKU', synthesized: false })
  })
  it('synthétise une clé si la primaire a des doublons', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1' },
      { _id: 'r1', sku: 'A1' },
    ])
    expect(resolveKeyInfo(s, buildEcFieldNames(cols))).toEqual({ keyName: '_ec_key', synthesized: true })
  })
  it('synthétise une clé si la primaire a une valeur vide', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1' },
      { _id: 'r1', sku: null },
    ])
    expect(resolveKeyInfo(s, buildEcFieldNames(cols)).synthesized).toBe(true)
  })
})

describe('buildCsv', () => {
  const cols = [
    col('sku', 'SKU', { isPrimary: true }),
    col('name', 'Désignation'),
    col('img', 'Visuel', { fieldType: 'image' }),
  ]
  const s = sheet(cols, [
    { _id: 'r0', sku: 'A1', name: 'Marteau', img: 'https://x/o/p%2Fm.png?token=z' },
    { _id: 'r1', sku: 'A2', name: 'Vis, lot "L"', img: '' },
  ])
  const ecNames = buildEcFieldNames(cols)
  const keyInfo = resolveKeyInfo(s, ecNames)

  it('commence par un BOM UTF-8', () => {
    expect(buildCsv(s, ecNames, keyInfo, 'tab').charCodeAt(0)).toBe(0xfeff)
  })
  it('écrit l’en-tête en ecFieldName, séparé par tab', () => {
    const header = buildCsv(s, ecNames, keyInfo, 'tab').replace('﻿', '').split('\r\n')[0]
    expect(header).toBe('SKU\tDésignation\tVisuel')
  })
  it('échappe le délimiteur et les guillemets en mode virgule', () => {
    const line = buildCsv(s, ecNames, keyInfo, 'comma').split('\r\n')[2]
    expect(line).toBe('A2,"Vis, lot ""L""",')
  })
  it('remplace les colonnes image par le nom de fichier', () => {
    const line = buildCsv(s, ecNames, keyInfo, 'tab').split('\r\n')[1]
    expect(line).toBe('A1\tMarteau\tm.png')
  })
  it('préfixe une colonne _ec_key quand la clé est synthétisée', () => {
    const cols2 = [col('sku', 'SKU', { isPrimary: true })]
    const s2 = sheet(cols2, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const names2 = buildEcFieldNames(cols2)
    const key2 = resolveKeyInfo(s2, names2)
    const csv = buildCsv(s2, names2, key2, 'tab').replace('﻿', '')
    expect(csv.split('\r\n')[0]).toBe('_ec_key\tSKU')
    expect(csv.split('\r\n')[1]).toBe('row_1\tA1')
  })
})
