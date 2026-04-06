import { useCallback } from 'react'
import { globalFabricCanvas } from './CanvasContainer'
import { usePagesStore } from '@/stores/pages.store'
import { syncToStore } from './useAddObject'

export function usePageNavigation() {
  const { pages, currentPageIndex, updatePage, setCurrentPage } = usePagesStore()

  const saveCurrentPage = useCallback(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const page = pages[currentPageIndex]
    if (!page) return

    const json = JSON.stringify(canvas.toObject(['data']))
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

      // Clear non-grid objects
      const nonGrid = canvas.getObjects().filter((o) => !o.data?.isGrid)
      nonGrid.forEach((o) => canvas.remove(o))

      if (newPage.canvasJSON) {
        await canvas.loadFromJSON(JSON.parse(newPage.canvasJSON))
      }

      canvas.requestRenderAll()
      syncToStore(canvas)
      setCurrentPage(newIndex)
    },
    [pages, currentPageIndex, saveCurrentPage, updatePage, setCurrentPage],
  )

  return { navigateToPage, saveCurrentPage }
}
