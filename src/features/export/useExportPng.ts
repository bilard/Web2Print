import { useCallback } from 'react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'

export type PngDpi = 72 | 150 | 300

export function useExportPng() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportPng = useCallback(async (dpi: PngDpi = 150): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const multiplier = dpi / 72

    // Déselectionner avant export
    canvas.discardActiveObject()
    canvas.requestRenderAll()

    // Retirer temporairement les objets grille
    const gridObjects = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjects.forEach((o) => canvas.remove(o))
    canvas.requestRenderAll()

    const dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      quality: 1,
    })

    // Remettre la grille
    gridObjects.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    // Déclenche le téléchargement
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_${dpi}dpi.png`
    a.click()
  }, [projectTitle])

  return { exportPng }
}
