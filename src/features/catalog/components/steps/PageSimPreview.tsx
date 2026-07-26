// Simulation de PAGE dans « Prompt & style » : N copies du produit échantillon
// passées dans le VRAI moteur (paginateCatalog, mode uniforme + grille
// représentative — identique à useCatalogPages) et rendues par la VRAIE page
// (CatalogPageView) → conforme au résultat de l'Aperçu/export par construction
// (spans, magnification, bandeaux, fit). La 1re fiche porte l'overlay d'édition.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey, CustomFieldMap } from '@/features/retail-promo/promoTypes'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import type { CardBox, CardObjectId, CatalogCardStyle, CatalogGrid, CatalogFormat, CatalogPlan, CatalogTreeNode } from '../../catalogTypes'
import { pagePx, type CatalogRenderCtx } from '../pages/catalogCss'
import { paginateCatalog, representativeGrid } from '../../catalogEngine'
import { universeColors } from '../../catalogFlatplan'
import { CatalogPageView } from '../pages/CatalogPageView'
import { CardLayoutOverlay } from './CardLayoutOverlay'

interface Props {
  plan: CatalogPlan
  /** Style effectif (défauts fusionnés) — pour l'overlay d'édition. */
  cardStyle: CatalogCardStyle
  format: CatalogFormat
  columns: MergeColumn[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  customFields: CustomFieldMap
  /** Ligne échantillon (produit prévisualisé) — dupliquée N fois dans la page. */
  row: MergeRow
  /** Densité simulée (produits/page). */
  grid: CatalogGrid
  zoom?: number
  /** Édition des blocs sur la 1re fiche (drag/resize/sélection). */
  onLayoutChange?: (id: CardObjectId, box: CardBox, wide: boolean) => void
  onSelect?: (id: CardObjectId | null) => void
  selected?: CardObjectId | null
  /** Variante RÉELLE de la 1re fiche mesurée (le panneau Bloc sélectionné suit). */
  onMeasuredWide?: (wide: boolean) => void
}

export function PageSimPreview({ plan, cardStyle, format, columns, fieldMap, customFields, row, grid, zoom = 1, onLayoutChange, onSelect, selected, onMeasuredWide }: Props) {
  const { w: pw, h: ph } = pagePx(format)
  // N copies de l'échantillon → moteur réel (mêmes paramètres que useCatalogPages).
  const { page, ctx } = useMemo(() => {
    const n = grid as number
    const ids = Array.from({ length: n }, (_, i) => `__sim_${i}`)
    const rows = ids.map((id) => ({ ...row, _id: id }))
    const tree: CatalogTreeNode[] = [{ id: '__sim', label: 'Univers', level: 1, children: [], productIds: ids }]
    const sections = [{ nodeId: '__sim', productsPerPage: grid, randomDensity: false, featuredIds: [] as string[] }]
    const f = extractPromoFields(rows[0], columns, fieldMap)
    const prices = new Map(ids.map((id) => [id, f.newPrice ?? f.oldPrice]))
    const pages = paginateCatalog({
      tree, sections, sizeByPrice: plan.sizeByPrice ?? true, prices,
      uniform: true, uniformGrid: representativeGrid(plan.sections),
    })
    const products = pages.find((p) => p.kind === 'products') ?? null
    const ctx2: CatalogRenderCtx = {
      plan: { ...plan, sections }, format, rowsById: new Map(rows.map((r) => [r._id, r])),
      columns, fieldMap, customFields, catalogName: 'Simulation', totalPages: pages.length,
      coverImageUrl: null, backCoverImageUrl: null, universeColors: universeColors(pages, plan.sections),
    }
    return { page: products, ctx: ctx2 }
  }, [plan, format, columns, fieldMap, customFields, row, grid])
  // Ajustement auto à la colonne, × zoom utilisateur.
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [availW, setAvailW] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth))
    ro.observe(el)
    setAvailW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const K = Math.max(0.2, Math.round((availW != null ? Math.max(320, availW - 8) / pw : 0.6) * zoom * 100) / 100)
  // Overlay d'édition sur la 1RE FICHE réelle de la page : on repère son élément
  // (.cat-cell) et sa position visuelle — poignées HORS de la page scalée.
  const cellRef = useRef<HTMLDivElement | null>(null)
  const [overlayRect, setOverlayRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [measuredWide, setMeasuredWide] = useState(false)
  useLayoutEffect(() => {
    const w = wrapRef.current
    if (!w || !onLayoutChange) return
    const measure = () => {
      const cell = w.querySelector<HTMLDivElement>('.cat-cell')
      cellRef.current = cell
      if (!cell) { setOverlayRect(null); return }
      const wr = w.getBoundingClientRect(), cr = cell.getBoundingClientRect()
      setOverlayRect({ left: cr.left - wr.left, top: cr.top - wr.top, width: cr.width, height: cr.height })
      const wide = cr.height > 0 && cr.width / cr.height >= 1.3
      setMeasuredWide(wide)
      onMeasuredWide?.(wide)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(w)
    return () => ro.disconnect()
  }, [K, grid, page])
  if (!page) return null
  return (
    <div ref={wrapRef} className="w-full min-w-0 relative">
      <div style={{ width: pw * K, height: ph * K, position: 'relative', overflow: 'hidden' }} className="rounded-lg border border-border shadow-2xl">
        <div style={{ transform: `scale(${K})`, transformOrigin: 'top left', width: pw, height: ph }}>
          <CatalogPageView page={page} ctx={ctx} />
        </div>
      </div>
      {onLayoutChange && overlayRect && (
        <div style={{ position: 'absolute', ...overlayRect }}>
          <CardLayoutOverlay cardRef={cellRef} style={cardStyle} wide={measuredWide}
            onChange={(id, box) => onLayoutChange(id, box, measuredWide)} onSelect={onSelect} selected={selected} />
        </div>
      )}
    </div>
  )
}
