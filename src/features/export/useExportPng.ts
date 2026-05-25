import { useCallback } from 'react'
import type { Canvas } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'

export type PngDpi = 72 | 150 | 300

/**
 * Cœur paramétré : rasterise `canvas` à la résolution donnée et retourne un Blob PNG.
 * Ne déclenche aucun téléchargement. Utilisable depuis les workflows.
 */
export async function exportPngBlob(canvas: Canvas, dpi: number = 150): Promise<Blob> {
  const multiplier = dpi / 72

  // Déselectionner avant export
  canvas.discardActiveObject()
  canvas.requestRenderAll()

  // Retirer temporairement les objets grille
  const gridObjects = canvas.getObjects().filter((o) => o.data?.isGrid)
  gridObjects.forEach((o) => canvas.remove(o))
  canvas.requestRenderAll()

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL({
      format: 'png',
      multiplier,
      quality: 1,
    })
  } catch (err) {
    // Remettre la grille avant de propager l'erreur
    gridObjects.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        '[exportPngBlob] Canvas tainté (SecurityError) — une image est chargée sans CORS. ' +
        'Vérifiez que les images Firebase Storage ont les en-têtes CORS appropriés.',
      )
    }
    throw err
  }

  // Remettre la grille
  gridObjects.forEach((o) => canvas.add(o))
  canvas.requestRenderAll()

  const res = await fetch(dataUrl)
  return res.blob()
}

export function useExportPng() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportPng = useCallback(async (dpi: PngDpi = 150): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const blob = await exportPngBlob(canvas, dpi)
    const url = URL.createObjectURL(blob)

    // Déclenche le téléchargement
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_${dpi}dpi.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [projectTitle])

  return { exportPng }
}
