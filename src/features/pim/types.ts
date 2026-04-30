import type { CellValue, ExcelColumn, TaxonomyCategory, TaxonomyLevelMap } from '@/features/excel/types'

/** Document Firestore racine. Remplace l'ancien doc `excel_data`. */
export interface Project {
  id: string
  name: string
  /** Folder breadcrumb in the project hierarchy (distinct du taxonomyPath des produits). */
  path: string[]
  taxonomyLevels?: TaxonomyLevelMap
  taxonomy: TaxonomyCategory[]
  sources: Source[]
  createdAt: number
  updatedAt: number
}

export type SourceKind = 'scrape' | 'import' | 'manual'

export interface Source {
  id: string
  name: string
  kind: SourceKind
  url?: string
  favicon?: string
  group?: string
  schema: ExcelColumn[]
  productCount: number
  enrichedCount: number
  lastSyncedAt?: number
}

/** Produit master, sub-collection projects/{id}/products/{productId}. */
export interface Product {
  /** Firestore doc ID, mirrors ExcelRow._id convention. */
  _id: string
  masterSku: string | null
  masterEan: string | null
  primarySourceId: string
  fields: Record<string, ProductField>
  sourceLinks: SourceLink[]
  taxonomyPath: string[]
  needsDedup: boolean
  createdAt: number
  updatedAt: number
}

export interface ProductField {
  value: CellValue
  winningSourceId: string
  overridden?: boolean
}

export interface SourceLink {
  sourceId: string
  externalSku?: string
  externalUrl?: string
  snapshot: Record<string, CellValue>
}

export interface MergePreview {
  newMasters: PreviewRow[]
  mergedOnExisting: PreviewMerge[]
  needsDedup: PreviewRow[]
}

export interface PreviewRow {
  rowIndex: number
  detectedSku: string | null
  snapshot: Record<string, CellValue>
}

export interface PreviewMerge extends PreviewRow {
  targetProductId: string
  targetMasterSku: string | null
  fieldChanges: Array<{ key: string; from: CellValue; to: CellValue; willApply: boolean; reason?: string }>
}
