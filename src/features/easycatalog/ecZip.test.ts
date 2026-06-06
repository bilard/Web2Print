// src/features/easycatalog/ecZip.test.ts
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { buildEcZip } from './ecZip'
import type { ExcelSheet, ExcelColumn, ExcelRow } from '@/features/excel/types'

function col(key: string, label: string, extra: Partial<ExcelColumn> = {}): ExcelColumn {
  return { key, label, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 120, ...extra }
}
function sheet(columns: ExcelColumn[], rows: ExcelRow[]): ExcelSheet {
  return { name: 'Produits', columns, rows, taxonomy: [] }
}

const cols = [col('sku', 'SKU', { isPrimary: true }), col('img', 'Visuel', { fieldType: 'image' })]
const s = sheet(cols, [{ _id: 'r0', sku: 'A1', img: 'https://x/o/m.png?t=1' }])

describe('buildEcZip', () => {
  it('inclut data.csv + fields.json + images.csv + README.txt en mode CSV', async () => {
    const zip = await buildEcZip(s, 'Ma Source', { format: 'csv-tab' })
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual(['README.txt', 'data.csv', 'fields.json', 'images.csv'])
    const fields = JSON.parse(await zip.file('fields.json')!.async('string'))
    expect(fields.fields[0].ecFieldName).toBe('SKU')
  })
  it('produit data.xlsx en mode xlsx et omet images.csv sans champ image', async () => {
    const noImg = sheet([col('sku', 'SKU', { isPrimary: true })], [{ _id: 'r0', sku: 'A1' }])
    const zip = await buildEcZip(noImg, 'S', { format: 'xlsx' })
    const names = Object.keys(zip.files).sort()
    expect(names).toEqual(['README.txt', 'data.xlsx', 'fields.json'])
  })
  it('réimporte data.xlsx avec un en-tête ecFieldName', async () => {
    const zip = await buildEcZip(s, 'S', { format: 'xlsx' })
    const buf = await zip.file('data.xlsx')!.async('uint8array')
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
    expect(Object.keys(json[0])).toContain('Visuel')
    expect(json[0].Visuel).toBe('m.png')
  })
})

// garantit que JSZip est bien la dépendance utilisée
void JSZip
