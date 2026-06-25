// src/features/export/useDeclineToPages.ts
// Déclinaisons multi-format v3 — crée une page éditable par format cible. Le
// re-layout est piloté par LLM (relayoutToFormats), avec repli géométrique
// (projectObjectsToFormat) garanti. Rend la page source en PNG pour le LLM.
import { useCallback } from 'react'
import type { Canvas } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { FABRIC_SERIALIZED_PROPS } from '@/features/editor/serializationProps'
import { usePagesStore } from '@/stores/pages.store'
import { useUIStore } from '@/stores/ui.store'
import { relayoutToFormats } from './relayoutToFormats'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import { recordAudit } from '@/lib/auditLog'
import type { DesignObject } from './relayoutMultiFormat'

interface SerializedCanvas {
  objects?: Array<DesignObject & { data?: { isGrid?: boolean; isPrintMark?: boolean; role?: string } }>
  [key: string]: unknown
}

export interface DeclineOutcome {
  created: number
  usedFallback: boolean
}

/** Rend la page courante en design-space (grille + marques masquées), bornée à
 * 1024 px de plus grand côté. Neutralise le viewport (zoom/pan) et les dimensions
 * DOM du conteneur pour que l'image corresponde au repère des descripteurs. */
function renderSourceDataUri(canvas: Canvas, srcW: number, srcH: number): string | null {
  canvas.discardActiveObject()
  const hidden = canvas.getObjects().filter((o) => o.data?.isGrid || o.data?.isPrintMark)
  hidden.forEach((o) => { o.visible = false })
  const savedVt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0]
  const savedW = canvas.getWidth()
  const savedH = canvas.getHeight()
  const scale = Math.min(1, 1024 / Math.max(srcW, srcH, 1))
  try {
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0])
    canvas.setDimensions({ width: srcW * scale, height: srcH * scale })
    return canvas.toDataURL({ format: 'png', multiplier: 1, quality: 0.9 })
  } catch (err) {
    console.warn('[declineToPages] toDataURL a échoué (CORS ?), repli sans image :', err)
    return null
  } finally {
    canvas.setDimensions({ width: savedW, height: savedH })
    canvas.setViewportTransform(savedVt as [number, number, number, number, number, number])
    hidden.forEach((o) => { o.visible = true })
    canvas.requestRenderAll()
  }
}

export function useDeclineToPages() {
  const declineToPages = useCallback(
    async (targets: readonly DeclineTarget[]): Promise<DeclineOutcome> => {
      const canvas = globalFabricCanvas
      if (!canvas) throw new Error('Canvas indisponible.')
      if (targets.length === 0) return { created: 0, usedFallback: false }

      const { canvasWidth, canvasHeight } = useUIStore.getState()
      const serialized = canvas.toObject(FABRIC_SERIALIZED_PROPS) as SerializedCanvas
      const allObjects = serialized.objects ?? []
      // La grille et les marques de coupe sont propres au format source.
      const designObjects = allObjects.filter(
        (o) => !o.data?.isGrid && !o.data?.isPrintMark,
      )

      const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
      const { byFormat, usedFallback } = imageDataUri
        ? await relayoutToFormats({
            imageDataUri,
            objects: designObjects,
            srcW: canvasWidth,
            srcH: canvasHeight,
            targets,
          })
        : {
            // Pas d'image (toDataURL a échoué, ex. CORS) → repli homothétique direct.
            byFormat: Object.fromEntries(
              targets.map((t) => [
                t.id,
                projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h),
              ]),
            ),
            usedFallback: true,
          }

      const { pages, currentPageIndex, updatePage, addPage, setCurrentPage } = usePagesStore.getState()
      const originalIndex = currentPageIndex
      let created = 0

      targets.forEach((target) => {
        const projected = byFormat[target.id] ?? []
        const json = JSON.stringify({ ...serialized, objects: projected })
        // addPage déplace currentPageIndex sur la nouvelle page (en fin de liste).
        addPage(target.w, target.h)
        const next = usePagesStore.getState().pages
        const newPage = next[next.length - 1]
        if (newPage) {
          updatePage(newPage.id, { canvasJSON: json, label: target.label })
          created++
        }
      })

      // Le canvas affiche toujours la page source : on y recale l'index.
      setCurrentPage(Math.min(originalIndex, pages.length - 1))
      recordAudit({ action: 'export.declines', module: 'export', meta: { created } })
      return { created, usedFallback }
    },
    [],
  )

  return { declineToPages }
}
