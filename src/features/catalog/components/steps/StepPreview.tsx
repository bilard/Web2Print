// src/features/catalog/components/steps/StepPreview.tsx
// Étape 4 du wizard « Catalogue studio » : aperçu page à page de la pagination live.
// Une seule page montée à la fois (perf sur 100+ pages) ; rail en ARBRE structuré
// par univers (PreviewPageTree), léger — pas de CatalogPageView par vignette.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, SlidersHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { useCatalogPages } from '../../useCatalogPages'
import { usePreviewZoomPan } from '../../usePreviewZoomPan'
import { CatalogPageView } from '../pages/CatalogPageView'
import { pagePx } from '../pages/catalogCss'
import { PreviewPageTree } from './PreviewPageTree'
import { PageOptionsPanel } from './PageOptionsPanel'
import { ProductEditPanel } from './ProductEditPanel'

export function StepPreview() {
  const setStep = useCatalogStore((s) => s.setStep)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const previewIndex = useCatalogStore((s) => s.previewIndex)
  const setPreviewIndex = useCatalogStore((s) => s.setPreviewIndex)
  const { pages, ctx } = useCatalogPages()
  const [index, setIndex] = useState(0)
  const [showOptions, setShowOptions] = useState(true)
  // Double-clic sur une fiche → édition de la data produit (publication ou master).
  const [editRowId, setEditRowId] = useState<string | null>(null)

  // Arrivée depuis le chemin de fer : ouvrir directement la page demandée (one-shot).
  useEffect(() => {
    if (previewIndex !== null) { setIndex(previewIndex); setPreviewIndex(null) }
  }, [previewIndex, setPreviewIndex])
  const containerRef = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState({ w: 0, h: 0 })
  // Zoom (trackpad/Ctrl+molette, ancré sous le curseur) + pan à la barre d'espace.
  const { zoom, setZoom, kRef, panHandlers, cursorClass } = usePreviewZoomPan(containerRef, pages.length > 0 && !!ctx)

  const clampedIndex = pages.length === 0 ? 0 : Math.min(index, pages.length - 1)

  useEffect(() => {
    if (index > pages.length - 1) setIndex(Math.max(0, pages.length - 1))
  }, [pages.length, index])

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setAvail({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(pages.length - 1, i + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pages.length])

  if (pages.length === 0 || !ctx) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune page à prévisualiser — vérifiez la sélection et la structure.</div>
  }

  const currentPage = pages[clampedIndex]
  const { w, h } = pagePx(ctx.format)
  const fitK = avail.w > 0 && avail.h > 0 ? Math.min((avail.w - 24) / w, (avail.h - 24) / h, 1) : 1
  const k = zoom ?? fitK
  const zoomBy = (f: number) => setZoom(Math.min(4, Math.max(0.1, k * f)))
  kRef.current = k

  return (
    <div className="h-full flex">
      <aside className="w-64 shrink-0 border-r border-border bg-surface overflow-y-auto">
        <PreviewPageTree pages={pages} current={clampedIndex} onSelect={setIndex} />
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={clampedIndex === 0}
              className="p-1.5 rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent" title="Page précédente">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">page {clampedIndex + 1} / {pages.length}</span>
            <button onClick={() => setIndex((i) => Math.min(pages.length - 1, i + 1))} disabled={clampedIndex === pages.length - 1}
              className="p-1.5 rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent" title="Page suivante">
              <ChevronRight className="w-4 h-4" />
            </button>
            {/* Zoom */}
            <div className="flex items-center gap-1 ml-3 pl-3 border-l border-border">
              <button onClick={() => zoomBy(1 / 1.25)} className="p-1.5 rounded-md hover:bg-surface-2" title="Dézoomer">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-center">{Math.round(k * 100)}%</span>
              <button onClick={() => zoomBy(1.25)} className="p-1.5 rounded-md hover:bg-surface-2" title="Zoomer">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => setZoom(null)} disabled={zoom === null}
                className="p-1.5 rounded-md hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent" title="Ajuster à la fenêtre">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            {/* Options du fond de page (panneau droit contextuel) */}
            <button onClick={() => setShowOptions((v) => !v)}
              className={`flex items-center gap-1.5 ml-3 pl-3 border-l border-border px-2.5 py-1.5 rounded-md text-xs ${showOptions ? 'text-indigo-300 bg-indigo-600/15' : 'text-muted-foreground hover:bg-surface-2 hover:text-white'}`}
              title="Afficher/masquer les options du fond de page">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Fond de page
            </button>
          </div>
          <button onClick={() => setStep('export')}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
            Continuer → Export <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div ref={containerRef} {...panHandlers} className={`flex-1 min-h-0 overflow-auto flex bg-well ${cursorClass}`}>
          {/* m-auto : centré tant que la page tient, scrollable une fois zoomée */}
          <div className="m-auto p-3 w-fit">
            <div style={{ width: w * k, height: h * k, overflow: 'hidden' }}>
              <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }}>
                <CatalogPageView page={currentPage} ctx={{ ...ctx, onEditRow: setEditRowId }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {editRowId && <ProductEditPanel rowId={editRowId} onClose={() => setEditRowId(null)} />}
      {/* Options à droite (pattern app) : édition du fond de la page AFFICHÉE, mise à jour live */}
      {showOptions && (
        <PageOptionsPanel page={currentPage} plan={ctx.plan} setPlan={setPlan}
          coverImageUrl={ctx.coverImageUrl} backCoverImageUrl={ctx.backCoverImageUrl}
          chapterColor={currentPage.kind === 'products' || currentPage.kind === 'opener'
            ? ctx.universeColors?.get(currentPage.nodeId) : undefined} />
      )}
    </div>
  )
}
