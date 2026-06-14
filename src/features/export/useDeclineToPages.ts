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
import { usePageNavigation } from '@/features/editor/usePageNavigation'
import { relayoutToFormats } from './relayoutToFormats'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import type { DesignObject } from './relayoutMultiFormat'
import { fluidRelayoutToFormat } from './fluidRelayoutToFormat'

interface SerializedCanvas {
  objects?: Array<DesignObject & { data?: { isGrid?: boolean; isPrintMark?: boolean; role?: string } }>
  [key: string]: unknown
}

export interface DeclineOutcome {
  created: number
  updated: number
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
  const { navigateToPage } = usePageNavigation()
  const declineToPages = useCallback(
    async (
      targets: readonly DeclineTarget[],
      options?: { navigateToLast?: boolean; transform?: 'ai' | 'contain' | 'cover' | 'fluid' },
    ): Promise<DeclineOutcome> => {
      const canvas = globalFabricCanvas
      if (!canvas) throw new Error('Canvas indisponible.')
      if (targets.length === 0) return { created: 0, updated: 0, usedFallback: false }

      const transform = options?.transform ?? 'ai'
      const { canvasWidth, canvasHeight } = useUIStore.getState()
      const serialized = canvas.toObject(FABRIC_SERIALIZED_PROPS) as SerializedCanvas
      const allObjects = serialized.objects ?? []
      // La grille et les marques de coupe sont propres au format source.
      const designObjects = allObjects.filter(
        (o) => !o.data?.isGrid && !o.data?.isPrintMark,
      )

      // Transformation DÉTERMINISTE (proportionnelle, composition préservée) :
      // le « Reformater en proportion » passe par ici (pas de LLM, instantané,
      // sans coût). Le mode 'ai' (déclinées multi-format) garde le re-layout LLM.
      let byFormat: Record<string, DesignObject[]>
      let usedFallback = false
      if (transform === 'contain' || transform === 'cover') {
        byFormat = Object.fromEntries(
          targets.map((t) => [
            t.id,
            projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h, transform),
          ]),
        )
      } else if (transform === 'fluid') {
        // Re-layout par blocs piloté LLM (image source requise pour la vision),
        // repli cover garanti par fluidRelayoutToFormat.
        const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
        if (!imageDataUri) {
          byFormat = Object.fromEntries(
            targets.map((t) => [
              t.id,
              projectObjectsToFormat(designObjects, canvasWidth, canvasHeight, t.w, t.h, 'cover'),
            ]),
          )
          usedFallback = true
        } else {
          const entries = await Promise.all(
            targets.map(async (t) => {
              const out = await fluidRelayoutToFormat({
                imageDataUri,
                objects: designObjects,
                srcW: canvasWidth,
                srcH: canvasHeight,
                target: t,
              })
              if (out.usedFallback) usedFallback = true
              return [t.id, out.objects] as const
            }),
          )
          byFormat = Object.fromEntries(entries)
        }
      } else {
        const imageDataUri = renderSourceDataUri(canvas, canvasWidth, canvasHeight)
        const outcome = imageDataUri
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
        byFormat = outcome.byFormat
        usedFallback = outcome.usedFallback
      }

      const { currentPageIndex, updatePage, addPage, setCurrentPage } = usePagesStore.getState()
      const originalIndex = currentPageIndex
      let created = 0
      let updated = 0

      targets.forEach((target) => {
        const projected = byFormat[target.id] ?? []
        const json = JSON.stringify({ ...serialized, objects: projected })
        const existing = usePagesStore.getState().pages
        const last = existing[existing.length - 1]
        // Idempotence de format : ré-appliquer le même format met à jour la
        // dernière page adaptée au lieu d'en empiler une nouvelle.
        const reuse =
          last && last.label === target.label &&
          Math.round(last.width) === target.w && Math.round(last.height) === target.h
        if (reuse && last) {
          updatePage(last.id, { canvasJSON: json, label: target.label })
          updated++
          return
        }
        // addPage déplace currentPageIndex sur la nouvelle page (en fin de liste).
        addPage(target.w, target.h)
        const next = usePagesStore.getState().pages
        const newPage = next[next.length - 1]
        if (newPage) {
          updatePage(newPage.id, { canvasJSON: json, label: target.label })
          created++
        }
      })

      if (options?.navigateToLast) {
        const finalPages = usePagesStore.getState().pages
        const targetIndex = finalPages.length - 1
        // addPage a déjà déplacé currentPageIndex sur la dernière page : navigateToPage
        // court-circuiterait (newIndex === currentPageIndex) sans charger le JSON ni
        // redimensionner le canvas. On repositionne d'abord sur la source.
        usePagesStore.getState().setCurrentPage(Math.min(originalIndex, finalPages.length - 1))
        await navigateToPage(targetIndex)
      } else {
        // Le canvas affiche toujours la page source : on y recale l'index.
        const live = usePagesStore.getState().pages
        setCurrentPage(Math.min(originalIndex, live.length - 1))
      }
      return { created, updated, usedFallback }
    },
    [navigateToPage],
  )

  return { declineToPages }
}
