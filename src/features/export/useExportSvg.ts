import { useCallback } from 'react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'

export function useExportSvg() {
  const projectTitle = useEditorStore((s) => s.projectTitle)

  const exportSvg = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    canvas.discardActiveObject()
    canvas.requestRenderAll()

    const gridObjects = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjects.forEach((o) => canvas.remove(o))
    canvas.requestRenderAll()

    const { canvasWidth, canvasHeight, canvasBg } = useUIStore.getState()

    const svgMarkup = canvas.toSVG({
      viewBox: { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
      width: `${canvasWidth}`,
      height: `${canvasHeight}`,
    })

    gridObjects.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    // Injecte un fond si défini (canvas.toSVG n'inclut pas backgroundColor par défaut)
    let finalSvg = svgMarkup
    if (canvasBg && canvasBg !== 'transparent') {
      const bgRect = `<rect x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" fill="${canvasBg}"/>`
      finalSvg = svgMarkup.replace(/(<svg[^>]*>)/, `$1${bgRect}`)
    }

    const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.svg`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [projectTitle])

  return { exportSvg }
}
