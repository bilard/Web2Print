// src/features/easycatalog/ecZip.ts
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import type { ExcelSheet } from '@/features/excel/types'
import { buildEcFieldNames } from './ecFieldName'
import {
  buildCsv,
  buildFieldDescriptors,
  buildImagesCsv,
  buildXlsxRows,
  resolveKeyInfo,
  type EcKeyInfo,
} from './ecExport'

export type EcFormat = 'csv-tab' | 'csv-comma' | 'xlsx'

export interface EcExportOptions {
  format: EcFormat
}

function buildReadme(keyInfo: EcKeyInfo): string {
  return [
    'Export EasyCatalog — Web2Print',
    '',
    '1. Dans EasyCatalog : File > New Data Source > Delimited (CSV) ou Microsoft Excel.',
    `2. Champ-clé : "${keyInfo.keyName}"${keyInfo.synthesized ? ' (généré automatiquement)' : ''}.`,
    '3. fields.json décrit le type EasyCatalog de chaque champ (alphanumeric / numeric / image).',
    '4. images.csv (si présent) : table url → nom de fichier pour rapatrier les visuels',
    '   dans le dossier image du data source.',
    '',
    'Round-trip document : ré-importer le template via EasyCatalog (Adopt Fields) pour relier',
    'le texte des champs à cette data source.',
  ].join('\n')
}

/** Assemble le zip d’export EasyCatalog (data + fields.json + images.csv + README). */
export async function buildEcZip(
  sheet: ExcelSheet,
  sourceName: string,
  options: EcExportOptions,
): Promise<JSZip> {
  const ecNames = buildEcFieldNames(sheet.columns)
  const keyInfo = resolveKeyInfo(sheet, ecNames)
  const descriptors = buildFieldDescriptors(sheet, ecNames, keyInfo)
  const imagesCsv = buildImagesCsv(sheet, ecNames, keyInfo)

  const zip = new JSZip()

  if (options.format === 'xlsx') {
    const wb = XLSX.utils.book_new()
    const rows = buildXlsxRows(sheet, ecNames, keyInfo)
    let ws
    if (rows.length > 0) {
      ws = XLSX.utils.json_to_sheet(rows)
    } else {
      const headers = [
        ...(keyInfo.synthesized ? ['_ec_key'] : []),
        ...sheet.columns.map((c) => ecNames.get(c.key) ?? c.key),
      ]
      ws = XLSX.utils.aoa_to_sheet([headers])
    }
    const safeName = sheet.name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Data'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    zip.file('data.xlsx', wbout)
  } else {
    const delimiter = options.format === 'csv-tab' ? 'tab' : 'comma'
    zip.file('data.csv', buildCsv(sheet, ecNames, keyInfo, delimiter))
  }

  zip.file('fields.json', JSON.stringify({ key: keyInfo, fields: descriptors }, null, 2))
  if (imagesCsv) zip.file('images.csv', imagesCsv)
  zip.file('README.txt', buildReadme(keyInfo))

  return zip
}
