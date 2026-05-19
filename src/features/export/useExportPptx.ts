import { useCallback } from 'react'
import PptxGenJS from 'pptxgenjs'
import { Textbox } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { CANVAS_DPI } from '@/features/print/dimensions'

// Le canvas est en pt (1 px = 1 pt = 1/72 inch).
const pxToIn = (px: number) => px / CANVAS_DPI

function cssToHex(color: string): string {
  if (!color || color === 'transparent') return 'FFFFFF'
  if (color.startsWith('#')) return color.replace('#', '').toUpperCase()
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) {
    return [match[1], match[2], match[3]]
      .map((v) => parseInt(v).toString(16).padStart(2, '0'))
      .join('').toUpperCase()
  }
  return '000000'
}

export function useExportPptx() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight } = useUIStore()

  const exportPptx = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const slideW = pxToIn(canvasWidth)
    const slideH = pxToIn(canvasHeight)

    const pptx = new PptxGenJS()
    pptx.defineLayout({ name: 'CUSTOM_CANVAS', width: slideW, height: slideH })
    pptx.layout = 'CUSTOM_CANVAS'

    const slide = pptx.addSlide()
    slide.background = { fill: 'FFFFFF' }

    // Save viewport, reset to capture exact document area
    const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
    const origWidth = canvas.getWidth()
    const origHeight = canvas.getHeight()

    canvas.discardActiveObject()
    const gridObjs = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjs.forEach((o) => canvas.remove(o))

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight })
    canvas.requestRenderAll()

    // Snapshot at exact document dimensions
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2, quality: 1 })

    // Restore viewport
    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origWidth, height: origHeight })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    slide.addImage({
      data: dataUrl,
      x: 0, y: 0,
      w: slideW,
      h: slideH,
    })

    // Calques texte pour l'édition dans PowerPoint
    const objects = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)

    for (const obj of objects) {
      const x = pxToIn(obj.left ?? 0)
      const y = pxToIn(obj.top ?? 0)
      const w = pxToIn(obj.getScaledWidth?.() ?? 100)
      const h = pxToIn(obj.getScaledHeight?.() ?? 50)

      if (obj instanceof Textbox) {
        const text = obj.text ?? ''
        if (!text.trim()) continue
        slide.addText(text, {
          x, y, w, h,
          fontSize: obj.fontSize ?? 12,
          fontFace: obj.fontFamily ?? 'Arial',
          bold: obj.fontWeight === 'bold',
          italic: obj.fontStyle === 'italic',
          color: cssToHex(typeof obj.fill === 'string' ? obj.fill : '#000000'),
          align: (obj.textAlign as 'left' | 'center' | 'right') ?? 'left',
          wrap: true,
          valign: 'top',
          transparency: 100, // invisible (image déjà là), mais texte sélectionnable
        })
      }
    }

    await pptx.writeFile({ fileName: `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.pptx` })
  }, [projectTitle, canvasWidth, canvasHeight])

  return { exportPptx }
}
