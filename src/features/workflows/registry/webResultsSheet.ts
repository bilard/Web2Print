// src/features/workflows/registry/webResultsSheet.ts
// Helper partagé : transforme des résultats de recherche web en ExcelSheet
// (utilisé par les nodes « Recherche web » et « Question web (IA) »).
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import type { WebSearchResult } from '@/features/scraping/webContext'

export function webResultsToSheet(results: WebSearchResult[], name = 'Recherche web'): ExcelSheet {
  const columns: ExcelColumn[] = [
    { key: 'title', label: 'Titre', fieldType: 'text', detectedType: 'text', isPrimary: true, width: 280 },
    { key: 'url', label: 'URL', fieldType: 'url', detectedType: 'url', isPrimary: false, width: 320 },
    { key: 'description', label: 'Description', fieldType: 'text', detectedType: 'text', isPrimary: false, width: 360 },
  ]
  const rows: ExcelRow[] = results.map((r, i) => ({
    _id: `web_${i}`,
    title: (r.title ?? '') as ExcelRow[string],
    url: r.url as ExcelRow[string],
    description: (r.description ?? '') as ExcelRow[string],
  }))
  return { name, columns, rows, taxonomy: [] }
}
