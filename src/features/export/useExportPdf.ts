import { useCallback } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Textbox } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  return [r, g, b]
}

function cssColorToRgb(color: string): [number, number, number] {
  if (!color || color === 'transparent') return [0, 0, 0]
  if (color.startsWith('#')) return hexToRgb(color)
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (match) return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255]
  return [0, 0, 0]
}

export function useExportPdf() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight } = useUIStore()

  const exportPdf = useCallback(async (): Promise<void> => {
    const canvas = globalFabricCanvas
    if (!canvas) return

    // Save current viewport state
    const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
    const origWidth = canvas.getWidth()
    const origHeight = canvas.getHeight()

    // Deselect and remove grid
    canvas.discardActiveObject()
    canvas.requestRenderAll()

    const gridObjs = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjs.forEach((o) => canvas.remove(o))

    // Reset viewport to capture exactly the document area at 2x resolution
    const multiplier = 2
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight })
    canvas.requestRenderAll()

    // Capture the document area as PNG
    const dataUrl = canvas.toDataURL({ format: 'png', multiplier, quality: 1 })

    // Restore viewport
    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origWidth, height: origHeight })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    // Create PDF with document dimensions (1 canvas px = 1 PDF point)
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([canvasWidth, canvasHeight])

    // White background
    page.drawRectangle({
      x: 0, y: 0, width: canvasWidth, height: canvasHeight,
      color: rgb(1, 1, 1),
    })

    // Embed canvas image
    const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
    const pngImage = await pdfDoc.embedPng(pngBytes)

    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
    })

    // Invisible text overlay for searchability
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const objects = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg)

    for (const obj of objects) {
      if (!(obj instanceof Textbox)) continue
      const text = obj.text ?? ''
      if (!text.trim()) continue

      const x = obj.left ?? 0
      const y = canvasHeight - (obj.top ?? 0) - (obj.height ?? 0)
      const fontSize = obj.fontSize ?? 12
      const fillColor = typeof obj.fill === 'string' ? cssColorToRgb(obj.fill) : [0, 0, 0]

      try {
        page.drawText(text, {
          x, y,
          size: fontSize,
          font: helvetica,
          color: rgb(fillColor[0], fillColor[1], fillColor[2]),
          opacity: 0,
        })
      } catch {
        // Ignore unsupported characters
      }
    }

    const pdfBytes = await pdfDoc.save()
    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, [projectTitle, canvasWidth, canvasHeight])

  return { exportPdf }
}
