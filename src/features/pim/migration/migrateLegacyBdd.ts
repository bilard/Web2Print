import type { ExcelSheet } from '@/features/excel/types'
import type { Project, Source, Product } from '../types'
import { matchRows } from '../matching/matchRows'
import { applyPreview } from '../matching/mergeStrategy'

interface LegacyDoc {
  docId: string
  fileName: string
  path?: string[]
  sheets: ExcelSheet[]
  taxonomyLevels?: unknown
}

interface Options { now: number }

interface MigrationResult {
  project: Project
  products: Product[]
  stats: { sourcesCreated: number; productsCreated: number; rowsMerged: number; needsDedup: number }
}

function inferSourceKind(name: string): Source['kind'] {
  return /\.[a-z]{2,}/i.test(name) ? 'scrape' : 'import'
}

export function migrateLegacyBdd(legacy: LegacyDoc, opts: Options): MigrationResult {
  const sources: Source[] = legacy.sheets.map((sheet, idx) => ({
    id: `src_${legacy.docId}_${idx}`,
    name: sheet.name,
    kind: inferSourceKind(sheet.name),
    schema: sheet.columns,
    productCount: 0,
    enrichedCount: 0,
    lastSyncedAt: opts.now,
  }))

  let products: Product[] = []
  let totalMerged = 0
  let totalNeedsDedup = 0

  legacy.sheets.forEach((sheet, idx) => {
    const sourceId = sources[idx].id
    const rows = sheet.rows.map((r) => {
      const { _id: _unused, ...rest } = r
      return rest as Record<string, string | number | boolean | null>
    })
    const preview = matchRows(rows, products)
    const result = applyPreview(preview, products, sourceId, { now: opts.now })
    products = result.products
    totalMerged += result.stats.merged
    totalNeedsDedup += result.stats.needsDedup
  })

  // Met à jour productCount par source
  for (const src of sources) {
    src.productCount = products.filter((p) =>
      p.sourceLinks.some((l) => l.sourceId === src.id),
    ).length
  }

  const project: Project = {
    id: legacy.docId,
    name: legacy.fileName,
    path: legacy.path ?? [],
    taxonomy: [],
    sources,
    createdAt: opts.now,
    updatedAt: opts.now,
  }

  return {
    project,
    products,
    stats: {
      sourcesCreated: sources.length,
      productsCreated: products.length - totalNeedsDedup,
      rowsMerged: totalMerged,
      needsDedup: totalNeedsDedup,
    },
  }
}
