import { useCallback } from 'react'
import { globalFabricCanvas } from './CanvasContainer'
import { usePagesStore } from '@/stores/pages.store'
import { syncToStore } from './useAddObject'
import { FABRIC_SERIALIZED_PROPS } from './serializationProps'
import { useUIStore } from '@/stores/ui.store'
import { ensurePageBgRect } from './useCanvas'

export function usePageNavigation() {
  const { pages, currentPageIndex, updatePage, setCurrentPage } = usePagesStore()

  const saveCurrentPage = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const page = pages[currentPageIndex]
    if (!page) return

    const json = JSON.stringify(canvas.toObject(FABRIC_SERIALIZED_PROPS))
    const thumbnail = canvas.toDataURL({ multiplier: 0.15, format: 'jpeg', quality: 0.5 } as any)
    updatePage(page.id, { canvasJSON: json, thumbnail })
  }, [pages, currentPageIndex, updatePage])

  const navigateToPage = useCallback(
    async (newIndex: number) => {
      const canvas = globalFabricCanvas
      if (!canvas || newIndex === currentPageIndex) return

      // Save current page state
      saveCurrentPage()

      const newPage = pages[newIndex]
      if (!newPage) return

      // La page cible peut avoir un format différent : on l'applique au canvas
      // (sinon le contenu chargé s'afficherait aux dimensions de la page précédente).
      // setCanvasSize recale aussi le viewport via l'effet de CanvasContainer.
      if (newPage.width && newPage.height) {
        useUIStore.getState().setCanvasSize(newPage.width, newPage.height)
      }

      // Clear non-grid objects
      const nonGrid = canvas.getObjects().filter((o) => !o.data?.isGrid)
      nonGrid.forEach((o) => canvas.remove(o))

      if (newPage.canvasJSON) {
        await canvas.loadFromJSON(JSON.parse(newPage.canvasJSON))
      }

      canvas.requestRenderAll()
      ensurePageBgRect(canvas)
      syncToStore(canvas)
      setCurrentPage(newIndex)
    },
    [pages, currentPageIndex, saveCurrentPage, updatePage, setCurrentPage],
  )

  return { navigateToPage, saveCurrentPage }
}
