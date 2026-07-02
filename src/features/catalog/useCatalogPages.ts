// src/features/catalog/useCatalogPages.ts
// Source unique de la pagination : Aperçu ET Export consomment le même résultat.
import { useMemo } from 'react'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree } from './catalogTree'
import { paginateCatalog } from './catalogEngine'
import { defaultCatalogPlan } from './catalogPlan'
import type { CatalogPageDescriptor } from './catalogTypes'
import type { CatalogRenderCtx } from './components/pages/catalogCss'

export function useCatalogPages(): { pages: CatalogPageDescriptor[]; ctx: CatalogRenderCtx | null } {
  const s = useCatalogStore()
  return useMemo(() => {
    if (s.rawRows.length === 0) return { pages: [], ctx: null }
    const selected = new Set(s.selectedRowIds)
    const rows = s.rawRows.filter((r) => selected.has(r._id))
    const tree = buildCatalogTree(rows, s.rawColumns, s.levelKeys, s.treeEdits)
    const plan = s.plan ?? defaultCatalogPlan(tree, s.name)
    const pages = paginateCatalog({ tree, sections: plan.sections })
    const ctx: CatalogRenderCtx = {
      plan, format: s.format, rowsById: new Map(rows.map((r) => [r._id, r])), columns: s.rawColumns,
      fieldMap: s.fieldMap, catalogName: s.name, totalPages: pages.length,
      coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
    }
    return { pages, ctx }
  }, [s.rawRows, s.rawColumns, s.selectedRowIds, s.levelKeys, s.treeEdits, s.plan, s.format, s.fieldMap, s.name, s.coverImageUrl, s.backCoverImageUrl])
}
