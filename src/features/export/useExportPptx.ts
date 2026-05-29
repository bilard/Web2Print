import { useCallback } from 'react'
import PptxGenJS from 'pptxgenjs'
import { Textbox } from 'fabric'
import type { Canvas } from 'fabric'
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

export interface ExportPptxBlobOptions {
  /** Largeur du canvas en px (coordonnées Fabric). */
  canvasWidth: number
  /** Hauteur du canvas en px (coordonnées Fabric). */
  canvasHeight: number
  /** Titre du projet (non utilisé dans le Blob — pour les métadonnées futures). */
  title?: string
  /** Multiplicateur de résolution (dpi/72). Défaut : 2. */
  multiplier?: number
}

/**
 * Cœur paramétré : génère un Blob PPTX depuis le canvas Fabric fourni.
 * Ne déclenche aucun téléchargement. Utilisable depuis les workflows.
 */
export async function exportPptxBlob(canvas: Canvas, opts: ExportPptxBlobOptions): Promise<Blob> {
  const { canvasWidth, canvasHeight, multiplier = 2 } = opts

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

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL({ format: 'png', multiplier, quality: 1 })
  } catch (err) {
    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origWidth, height: origHeight })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        '[exportPptxBlob] Canvas tainté (SecurityError) — une image est chargée sans CORS. ' +
        'Vérifiez que les images Firebase Storage ont les en-têtes CORS appropriés.',
        { cause: err },
      )
    }
    throw err
  }

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
        transparency: 100,
      })
    }
  }

  const output = await pptx.write({ outputType: 'blob' })
  return output instanceof Blob
    ? output
    : new Blob([output as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
}

export function useExportPptx() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight } = useUIStore()

  const exportPptx = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    const blob = await exportPptxBlob(canvas, {
      canvasWidth,
      canvasHeight,
      title: projectTitle,
      multiplier: 2,
    })

    // writeFile n'est plus utilisé — on crée le fichier manuellement pour la cohérence
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.pptx`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [projectTitle, canvasWidth, canvasHeight])

  return { exportPptx }
}
