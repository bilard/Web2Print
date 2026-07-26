import type { ExcelSheet } from '@/features/excel/types'
import { buildEcZip, type EcExportOptions } from './ecZip'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function useEasyCatalogExport() {
  const exportSheet = async (sheet: ExcelSheet, sourceName: string, options: EcExportOptions) => {
    const zip = await buildEcZip(sheet, sourceName, options)
    const blob = await zip.generateAsync({ type: 'blob' })
    const safeName = (sourceName || 'export').replace(/[^a-z0-9]/gi, '_')
    downloadBlob(blob, `EasyCatalog_${safeName}.zip`)
  }
  return { exportSheet }
}
