import type { ExcelColumn, TaxonomyCategory, TaxonomyLevelMap } from '@/features/excel/types'

/** Document Firestore racine. Remplace l'ancien doc `excel_data`. */
export interface Project {
  id: string
  name: string
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
  value: string | number | boolean | null
  winningSourceId: string
  overridden?: boolean
}

export interface SourceLink {
  sourceId: string
  externalSku?: string
  externalUrl?: string
  snapshot: Record<string, string | number | boolean | null>
}

export interface MergePreview {
  newMasters: PreviewRow[]
  mergedOnExisting: PreviewMerge[]
  needsDedup: PreviewRow[]
}

export interface PreviewRow {
  rowIndex: number
  detectedSku: string | null
  snapshot: Record<string, string | number | boolean | null>
}

export interface PreviewMerge extends PreviewRow {
  targetProductId: string
  targetMasterSku: string | null
  fieldChanges: Array<{ key: string; from: unknown; to: unknown; willApply: boolean; reason?: string }>
}
