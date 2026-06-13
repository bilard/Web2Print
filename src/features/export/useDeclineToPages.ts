// src/features/export/useDeclineToPages.ts
// Déclinaisons multi-format v2 — crée une page éditable par format cible à partir
// du design courant (re-projection « contain » + centrage). Voir declineLayout.ts.
import { useCallback } from 'react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { FABRIC_SERIALIZED_PROPS } from '@/features/editor/serializationProps'
import { usePagesStore } from '@/stores/pages.store'
import { useUIStore } from '@/stores/ui.store'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'

interface SerializedCanvas {
  objects?: Array<Record<string, unknown> & { data?: { isGrid?: boolean; isPrintMark?: boolean } }>
  [key: string]: unknown
}

export function useDeclineToPages() {
  const declineToPages = useCallback((targets: readonly DeclineTarget[]): number => {
    const canvas = globalFabricCanvas
    if (!canvas) throw new Error('Canvas indisponible.')
    if (targets.length === 0) return 0

    const { canvasWidth, canvasHeight } = useUIStore.getState()
    const serialized = canvas.toObject(FABRIC_SERIALIZED_PROPS) as SerializedCanvas
    const allObjects = serialized.objects ?? []
    // La grille et les marques de coupe sont propres au format source.
    const designObjects = allObjects.filter(
      (o) => !o.data?.isGrid && !o.data?.isPrintMark,
    )

    const { pages, currentPageIndex, updatePage, addPage, setCurrentPage } = usePagesStore.getState()
    const originalIndex = currentPageIndex
    let created = 0

    targets.forEach((target) => {
      const projected = projectObjectsToFormat(
        designObjects,
        canvasWidth,
        canvasHeight,
        target.w,
        target.h,
      )
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

    // Le canvas affiche toujours la page source : on y recale l'index pour rester
    // cohérent (pas de navigation/rechargement nécessaire).
    setCurrentPage(Math.min(originalIndex, pages.length - 1))
    return created
  }, [])

  return { declineToPages }
}
