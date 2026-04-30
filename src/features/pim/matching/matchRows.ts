import type { Product, MergePreview, PreviewRow, PreviewMerge } from '../types'
import { normalizeSku, type SkuCandidate } from './normalizeSku'
import type { CellValue } from '@/features/excel/types'

type RawRow = SkuCandidate & Record<string, unknown>

/** Indexe les products existants par leur clé canonique. */
function indexExisting(products: Product[]): Map<string, Product> {
  const index = new Map<string, Product>()
  for (const p of products) {
    if (p.masterSku) index.set(p.masterSku, p)
    if (p.masterEan) index.set(p.masterEan, p)
  }
  return index
}

export function matchRows(rows: RawRow[], existing: Product[]): MergePreview {
  const existingIndex = indexExisting(existing)
  const batchIndex = new Map<string, number>() // sku → index dans newMasters

  const newMasters: PreviewRow[] = []
  const mergedOnExisting: PreviewMerge[] = []
  const needsDedup: PreviewRow[] = []

  rows.forEach((row, rowIndex) => {
    const sku = normalizeSku(row)
    const snapshot = sanitize(row)
    const previewRow: PreviewRow = { rowIndex, detectedSku: sku, snapshot }

    if (!sku) {
      needsDedup.push(previewRow)
      return
    }

    const existingMatch = existingIndex.get(sku)
    if (existingMatch) {
      mergedOnExisting.push({
        ...previewRow,
        targetProductId: existingMatch._id,
        targetMasterSku: existingMatch.masterSku,
        fieldChanges: [], // calculé dans mergeStrategy
      })
      return
    }

    const batchHit = batchIndex.get(sku)
    if (batchHit !== undefined) {
      // 2e occurrence du même SKU dans le batch : merge sur le 1er
      mergedOnExisting.push({
        ...previewRow,
        targetProductId: `batch:${batchHit}`,
        targetMasterSku: newMasters[batchHit].detectedSku,
        fieldChanges: [],
      })
      return
    }

    batchIndex.set(sku, newMasters.length)
    newMasters.push(previewRow)
  })

  return { newMasters, mergedOnExisting, needsDedup }
}

/** Convertit unknown → primitive supportée par snapshot (string|number|boolean|null). */
function sanitize(row: RawRow): Record<string, CellValue> {
  const out: Record<string, CellValue> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else if (v !== undefined) {
      out[k] = String(v)
    }
  }
  return out
}
