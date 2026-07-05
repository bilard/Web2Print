// src/features/catalog/useCatalogPages.ts
// Source unique de la pagination : Aperçu ET Export consomment le même résultat.
import { useMemo } from 'react'
import { useCatalogStore } from '@/stores/catalog.store'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import { buildCatalogTree } from './catalogTree'
import { paginateCatalog, representativeGrid } from './catalogEngine'
import { applyPageOrder, universeColors } from './catalogFlatplan'
import { defaultCatalogPlan } from './catalogPlan'
import type { CatalogPageDescriptor, CatalogTreeNode } from './catalogTypes'
import type { CatalogRenderCtx } from './components/pages/catalogCss'

export interface CatalogPagesResult {
  pages: CatalogPageDescriptor[]
  ctx: CatalogRenderCtx | null
  /** Clés stables alignées sur `pages` (identité des pages du chemin de fer). */
  keys: string[]
  /** Arbre taxonomique effectif (rail de navigation du chemin de fer). */
  tree: CatalogTreeNode[]
}

export function useCatalogPages(): CatalogPagesResult {
  const s = useCatalogStore()
  return useMemo(() => {
    if (s.rawRows.length === 0) return { pages: [], ctx: null, keys: [], tree: [] }
    const selected = new Set(s.selectedRowIds)
    // Corrections « publication » (édition double-clic) appliquées PAR-DESSUS la
    // source : le rendu, l'export et l'arbre voient les valeurs corrigées.
    const rows = s.rawRows
      .filter((r) => selected.has(r._id))
      .map((r) => (s.rowOverrides[r._id] ? { ...r, ...s.rowOverrides[r._id] } : r))
    const tree = buildCatalogTree(rows, s.rawColumns, s.levelKeys, s.treeEdits)
    const plan = s.plan ?? defaultCatalogPlan(tree, s.name)
    // Prix de vente par ligne → sizing des fiches (plan.sizeByPrice, actif par défaut) ;
    // noms → « highlights » des affiches d'univers sans familles.
    const prices = new Map<string, number | null>()
    const names = new Map<string, string>()
    for (const r of rows) {
      const f = extractPromoFields(r, s.rawColumns, s.fieldMap)
      prices.set(r._id, f.newPrice ?? f.oldPrice)
      names.set(r._id, f.name)
    }
    const sizeByPrice = plan.sizeByPrice ?? true
    if (sizeByPrice && [...prices.values()].filter((p) => p != null).length < 3) {
      // Diagnostic : sizing demandé mais quasi aucun prix mappé → aucune carte ne grossira.
      console.warn('[catalog] sizeByPrice actif mais < 3 prix détectés (fieldMap.newPrice/oldPrice non mappés ?)')
    }
    // Ordre manuel du chemin de fer appliqué APRÈS la pagination (renumérote
    // et recale le sommaire) — aperçu et export voient le même ordre.
    // Mode UNIFORME (toujours) : une seule grille pour tout le catalogue → les
    // positions placées dans l'aperçu (disposition libre) sont fidèles au pixel.
    const { pages, keys } = applyPageOrder(
      paginateCatalog({ tree, sections: plan.sections, sizeByPrice, prices, names, uniform: true, uniformGrid: representativeGrid(plan.sections) }),
      s.pageOrder,
    )
    const ctx: CatalogRenderCtx = {
      plan, format: s.format, rowsById: new Map(rows.map((r) => [r._id, r])), columns: s.rawColumns,
      fieldMap: s.fieldMap, customFields: s.customFields, catalogName: s.name, totalPages: pages.length,
      coverImageUrl: s.coverImageUrl, backCoverImageUrl: s.backCoverImageUrl,
      universeColors: universeColors(pages, plan.sections),
    }
    return { pages, ctx, keys, tree }
  }, [s.rawRows, s.rawColumns, s.selectedRowIds, s.levelKeys, s.treeEdits, s.plan, s.format, s.fieldMap, s.customFields, s.name, s.coverImageUrl, s.backCoverImageUrl, s.pageOrder, s.rowOverrides])
}
