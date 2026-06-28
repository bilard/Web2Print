import * as XLSX from 'xlsx'
import type { ExcelSheet, ExcelColumn, ExcelRow, CellValue } from './types'
import { detectColumnType, computeColumnStats } from './fieldDetection'
import { applyExcelFormulas, type FormulaConversion } from './excelFormulas'
import { cellValue } from './cellValue'
import { useExcelStore } from '@/stores/excel.store'
import { recordAudit } from '@/lib/auditLog'

/**
 * Parse a file into ExcelSheet[] without touching the store.
 * `conversions` (optionnel) collecte les formules Excel converties en champs calculés
 * IBS Studio, pour animer la métamorphose à l'import.
 */
export async function parseExcelFile(
  file: File,
  conversions?: FormulaConversion[],
): Promise<ExcelSheet[]> {
  // Fichiers TEXTE (CSV/TSV/TXT) : lire via File.text() qui décode l'UTF-8 et
  // retire le BOM. En passant par arrayBuffer + type:'array', SheetJS retombe
  // sur le codepage 1252 par défaut → mojibake sur « € » et les accents
  // (« 299 € » devient « 299 â¬ »). Les formats binaires (xlsx/xls/ods)
  // stockent leurs chaînes en UTF-8 en interne : on garde l'ArrayBuffer.
  const name = file.name.toLowerCase()
  const isText =
    /\.(csv|tsv|txt)$/.test(name) || file.type === 'text/csv' || file.type === 'text/plain'
  const workbook = isText
    ? XLSX.read(await file.text(), { type: 'string', cellDates: true })
    : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheets: ExcelSheet[] = []

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<Record<string, CellValue>>(ws, { defval: null })
    if (jsonData.length === 0) continue

    const keys = Object.keys(jsonData[0]).filter((k) => k !== '__rowNum__')
    const columns: ExcelColumn[] = keys.map((key, idx) => {
      const values = jsonData.map((row) => row[key])
      const detectedType = detectColumnType(values)
      const stats = computeColumnStats(values, detectedType)
      return {
        key, label: key, fieldType: detectedType, detectedType,
        isPrimary: idx === 0,
        width: Math.max(120, Math.min(300, key.length * 10 + 40)),
        stats,
      }
    })

    const rows: ExcelRow[] = jsonData.map((row, idx) => ({
      _id: `row_${idx}`,
      ...Object.fromEntries(keys.map((k) => [k, row[k] ?? null])),
    }))

    // Préserver les formules Excel : une colonne dont chaque cellule porte la même
    // formule arithmétique « même ligne » (ex. Promotion = `=(E2-L2)/E2`) devient une
    // colonne `formula` native, recalculée en direct. cf. excelFormulas.ts.
    const rowNums = jsonData.map((row) => (row as { __rowNum__?: number }).__rowNum__ ?? 0)
    applyExcelFormulas(ws, columns, rows, rowNums, conversions)

    sheets.push({ name: sheetName, columns, rows, taxonomy: [] })
  }
  return sheets
}

export function useExcelImport() {
  const { setSheets, setDetecting, setCurrentFileName } = useExcelStore()

  const importFile = async (file: File): Promise<ExcelSheet[]> => {
    setDetecting(true)
    try {
      const sheets = await parseExcelFile(file)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      setCurrentFileName(baseName)
      setSheets(sheets)
      recordAudit({ action: 'data.dataset.import', module: 'data', targetLabel: file.name })
      return sheets
    } finally {
      setDetecting(false)
    }
  }

  const createEmpty = () => {
    const { sheets: existingSheets } = useExcelStore.getState()
    const sheetNumber = existingSheets.length + 1
    const sheet: ExcelSheet = {
      name: `Feuille ${sheetNumber}`,
      columns: [
        {
          key: 'col_1',
          label: 'Nom',
          fieldType: 'text',
          detectedType: 'text',
          isPrimary: true,
          width: 200,
        },
        {
          key: 'col_2',
          label: 'Description',
          fieldType: 'text_long',
          detectedType: 'text_long',
          isPrimary: false,
          width: 250,
        },
        {
          key: 'col_3',
          label: 'Categorie',
          fieldType: 'select_single',
          detectedType: 'select_single',
          isPrimary: false,
          width: 150,
        },
      ],
      rows: [],
      taxonomy: [],
    }
    // Préserver les feuilles existantes : ajouter la nouvelle feuille comme
    // nouvel onglet et la rendre active, au lieu d'écraser les données chargées.
    setSheets([...existingSheets, sheet])
    const store = useExcelStore.getState()
    store.setActiveSheet(existingSheets.length)
    // Fermer toute fiche produit ouverte — son rowId réfère à une ligne d'un
    // autre onglet et n'existe pas dans la nouvelle feuille vide.
    store.setSheetRowId(null)
  }

  const exportToXlsx = (sheets: ExcelSheet[], filename = 'export.xlsx') => {
    const wb = XLSX.utils.book_new()
    for (const sheet of sheets) {
      const data = sheet.rows.map((row) => {
        const obj: Record<string, CellValue> = {}
        for (const col of sheet.columns) {
          obj[col.label] = cellValue(col, row, sheet.columns)
        }
        return obj
      })
      const ws = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(wb, ws, sheet.name)
    }
    XLSX.writeFile(wb, filename)
  }

  return { importFile, createEmpty, exportToXlsx }
}
