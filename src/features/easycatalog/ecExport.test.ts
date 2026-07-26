import { describe, it, expect } from 'vitest'
import { ecTypeFor, imageFileName, resolveKeyInfo } from './ecExport'
import { buildCsv } from './ecExport'
import { buildFieldDescriptors, buildImagesCsv, buildXlsxRows } from './ecExport'
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

describe('buildFieldDescriptors', () => {
  const cols = [
    col('sku', 'SKU', { isPrimary: true }),
    col('price', 'Prix', { fieldType: 'currency' }),
    col('img', 'Visuel', { fieldType: 'image' }),
  ]
  const s = sheet(cols, [{ _id: 'r0', sku: 'A1', price: 10, img: 'u' }])
  const names = buildEcFieldNames(cols)
  const key = resolveKeyInfo(s, names)

  it('décrit chaque colonne avec son type EC et marque la clé', () => {
    const d = buildFieldDescriptors(s, names, key)
    expect(d).toEqual([
      { ecFieldName: 'SKU', sourceKey: 'sku', label: 'SKU', ecType: 'alphanumeric', isKey: true },
      { ecFieldName: 'Prix', sourceKey: 'price', label: 'Prix', ecType: 'numeric', isKey: false },
      { ecFieldName: 'Visuel', sourceKey: 'img', label: 'Visuel', ecType: 'image', isKey: false },
    ])
  })
  it('ajoute un descripteur _ec_key en tête si synthétisée', () => {
    const cols2 = [col('sku', 'SKU', { isPrimary: true })]
    const s2 = sheet(cols2, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const n2 = buildEcFieldNames(cols2)
    const d = buildFieldDescriptors(s2, n2, resolveKeyInfo(s2, n2))
    expect(d[0]).toEqual({ ecFieldName: '_ec_key', sourceKey: '_ec_key', label: 'Clé EasyCatalog', ecType: 'alphanumeric', isKey: true })
  })
})

describe('buildImagesCsv', () => {
  it('renvoie null sans colonne image', () => {
    const cols = [col('sku', 'SKU')]
    const s = sheet(cols, [{ _id: 'r0', sku: 'A' }])
    const names = buildEcFieldNames(cols)
    expect(buildImagesCsv(s, names, resolveKeyInfo(s, names))).toBeNull()
  })
  it('utilise row_N quand la clé est synthétisée', () => {
    const cols = [col('img', 'Visuel', { fieldType: 'image' })]
    const s = sheet(cols, [
      { _id: 'r0', img: 'https://x/o/p%2Fm.png?token=z' },
      { _id: 'r1', img: '' },
    ])
    const names = buildEcFieldNames(cols)
    const keyInfo = resolveKeyInfo(s, names)
    expect(keyInfo.synthesized).toBe(true)
    const csv = buildImagesCsv(s, names, keyInfo)!.replace('﻿', '')
    expect(csv.split('\r\n')).toEqual([
      'ecFieldName,row_key,url,filename',
      'Visuel,row_1,https://x/o/p%2Fm.png?token=z,m.png',
    ])
  })
  it('utilise la valeur de la colonne primaire comme row_key quand non synthétisée', () => {
    const cols = [
      col('sku', 'SKU', { isPrimary: true }),
      col('img', 'Visuel', { fieldType: 'image' }),
    ]
    const s = sheet(cols, [
      { _id: 'r0', sku: 'A1', img: 'https://x/o/m.png?t=1' },
      { _id: 'r1', sku: 'A2', img: 'https://x/o/n.png?t=2' },
    ])
    const names = buildEcFieldNames(cols)
    const keyInfo = resolveKeyInfo(s, names)
    expect(keyInfo.synthesized).toBe(false)
    const csv = buildImagesCsv(s, names, keyInfo)!.replace('﻿', '')
    expect(csv.split('\r\n')).toEqual([
      'ecFieldName,row_key,url,filename',
      'Visuel,A1,https://x/o/m.png?t=1,m.png',
      'Visuel,A2,https://x/o/n.png?t=2,n.png',
    ])
  })
})

describe('buildXlsxRows', () => {
  it('produit des objets clés par ecFieldName, images en nom de fichier', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true }), col('img', 'Visuel', { fieldType: 'image' })]
    const s = sheet(cols, [{ _id: 'r0', sku: 'A1', img: 'https://x/o/m.png?t=1' }])
    const names = buildEcFieldNames(cols)
    expect(buildXlsxRows(s, names, resolveKeyInfo(s, names))).toEqual([{ SKU: 'A1', Visuel: 'm.png' }])
  })
  it('inclut _ec_key quand synthétisée', () => {
    const cols = [col('sku', 'SKU', { isPrimary: true })]
    const s = sheet(cols, [{ _id: 'r0', sku: 'A1' }, { _id: 'r1', sku: 'A1' }])
    const names = buildEcFieldNames(cols)
    const rows = buildXlsxRows(s, names, resolveKeyInfo(s, names))
    expect(rows[0]).toEqual({ _ec_key: 'row_1', SKU: 'A1' })
  })
})
