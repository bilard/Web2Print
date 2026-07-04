// src/features/catalog/components/steps/StepFlatplan.tsx
// Étape « Chemin de fer » : toutes les pages en planches (doubles pages), tri
// manuel par glisser-déposer (persisté dans pageOrder), navigation par la
// taxonomie à gauche, stats globales en bandeau, clic = page en grand.
import { useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { useCatalogPages } from '../../useCatalogPages'
import { flatplanStats, nodePageRanges } from '../../catalogFlatplan'
import { StepActionsPortal } from './StepActionsPortal'
import { FlatplanStatsBar } from './FlatplanStatsBar'
import { FlatplanTaxonomy } from './FlatplanTaxonomy'
import { FlatplanBoard } from './FlatplanBoard'
import { FlatplanLightbox } from './FlatplanLightbox'

export function StepFlatplan() {
  const setStep = useCatalogStore((s) => s.setStep)
  const setPageOrder = useCatalogStore((s) => s.setPageOrder)
  const setPreviewIndex = useCatalogStore((s) => s.setPreviewIndex)
  const hasManualOrder = useCatalogStore((s) => s.pageOrder.length > 0)
  const { pages, ctx, keys, tree } = useCatalogPages()

  const [thumbWidth, setThumbWidth] = useState(120)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => flatplanStats(pages), [pages])
  const ranges = useMemo(() => nodePageRanges(pages), [pages])
  // Source unique des couleurs de chapitre (overrides utilisateur inclus) : le ctx.
  const colors = ctx?.universeColors ?? new Map<string, string>()

  if (pages.length === 0 || !ctx) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Aucune page — vérifiez la sélection et la structure.</div>
  }

  // Sélection d'un nœud du rail : surligne ses pages et fait défiler jusqu'à la première.
  const handleSelectNode = (nodeId: string | null) => {
    setSelectedNode(nodeId)
    if (!nodeId) return
    const range = ranges.get(nodeId)
    if (!range) return
    const idx = pages.findIndex((p) => p.pageNumber === range.first)
    if (idx < 0) return
    boardRef.current?.querySelector(`[data-fpkey="${CSS.escape(keys[idx])}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const openPreviewAt = (index: number) => {
    setPreviewIndex(index)
    setStep('preview')
  }

  return (
    <div className="h-full flex flex-col">
      <StepActionsPortal>
        <button onClick={() => setStep('preview')}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[#fff] text-sm font-medium">
          Continuer → Aperçu <ArrowRight className="w-4 h-4" />
        </button>
      </StepActionsPortal>
      <FlatplanStatsBar stats={stats} thumbWidth={thumbWidth} onThumbWidth={setThumbWidth}
        hasManualOrder={hasManualOrder} onResetOrder={() => setPageOrder([])} />
      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 shrink-0 border-r border-border bg-surface overflow-y-auto">
          <FlatplanTaxonomy tree={tree} ranges={ranges} colors={colors} selectedNode={selectedNode} onSelect={handleSelectNode} />
        </aside>
        <div ref={boardRef} className="flex-1 min-w-0 overflow-auto bg-well">
          <p className="px-4 pt-3 text-xs text-muted-foreground">
            Glissez-déposez les pages pour les réordonner (couverture, sommaire et 4e restent en place) — le sommaire et les numéros sont recalculés automatiquement.
          </p>
          <FlatplanBoard pages={pages} keys={keys} ctx={ctx} colors={colors} thumbWidth={thumbWidth}
            selectedNode={selectedNode} onReorder={setPageOrder} onOpen={setLightbox} />
        </div>
      </div>
      {lightbox !== null && (
        <FlatplanLightbox pages={pages} index={lightbox} ctx={ctx}
          onIndex={setLightbox} onClose={() => setLightbox(null)} onOpenPreview={openPreviewAt} />
      )}
    </div>
  )
}
