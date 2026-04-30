// src/features/scraping/core/scrapeToRows.ts
import type { ScrapeResult, ScrapingField } from '../useJina'
import type { ExcelColumn } from '@/features/excel/types'

/** Extrait UNIQUEMENT les colonnes du résultat scrape (sans construire la sheet). */
export function scrapeResultToColumns(
  result: ScrapeResult,
  fields: ScrapingField[],
): ExcelColumn[] {
  const sample = result.rows[0] ?? {}
  return fields.map<ExcelColumn>((f) => ({
    key: f.key,
    label: f.label ?? f.key,
    fieldType: 'text',
    detectedType: typeof sample[f.key] === 'number' ? 'number' : 'text',
    isPrimary: f.key === 'sku' || f.key === 'ean',
    width: 150,
  }))
}
