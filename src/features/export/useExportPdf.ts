import { useCallback } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Textbox } from 'fabric'
import type { Canvas } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { CANVAS_DPI } from '@/features/print/dimensions'

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

export interface ExportPdfOptions {
  /** Étend le canvas au bleed et ajoute des traits de coupe en L aux 4 coins. */
  withPrintMarks?: boolean
}

export interface ExportPdfBlobOptions extends ExportPdfOptions {
  /** Largeur du canvas en px (coordonnées Fabric). */
  canvasWidth: number
  /** Hauteur du canvas en px (coordonnées Fabric). */
  canvasHeight: number
  /** Saignant en mm (utilisé seulement si withPrintMarks=true). */
  bleedMm?: number
  /** Titre du projet (non utilisé dans le Blob — pour les métadonnées futures). */
  title?: string
  /** Multiplicateur de résolution (dpi/72). Défaut : 2. */
  multiplier?: number
}

/**
 * Cœur paramétré : génère un PDF Blob depuis le canvas Fabric fourni.
 * Ne déclenche aucun téléchargement. Utilisable depuis les workflows.
 */
export async function exportPdfBlob(canvas: Canvas, opts: ExportPdfBlobOptions): Promise<Blob> {
  const { canvasWidth, canvasHeight, bleedMm = 2, withPrintMarks = false, multiplier = 2 } = opts

  const withMarks = !!withPrintMarks
  const bleedPx = withMarks ? Math.round(bleedMm * (CANVAS_DPI / 25.4)) : 0
  const captureWidth = canvasWidth + 2 * bleedPx
  const captureHeight = canvasHeight + 2 * bleedPx

  // Sauvegarde de l'état viewport
  const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
  const origWidth = canvas.getWidth()
  const origHeight = canvas.getHeight()

  canvas.discardActiveObject()
  canvas.requestRenderAll()

  // Cache : grille + repères visuels
  const hidden = canvas.getObjects().filter((o) => o.data?.isGrid || o.data?.isPrintMark)
  hidden.forEach((o) => canvas.remove(o))

  // Centre la viewport sur la zone à capturer (canvas + bleed sur 4 côtés).
  canvas.setViewportTransform([1, 0, 0, 1, bleedPx, bleedPx])
  canvas.setDimensions({ width: captureWidth, height: captureHeight })
  canvas.requestRenderAll()

  let dataUrl: string
  try {
    dataUrl = canvas.toDataURL({ format: 'png', multiplier, quality: 1 })
  } catch (err) {
    // Restaure avant de propager
    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origWidth, height: origHeight })
    hidden.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()
    if (err instanceof DOMException && err.name === 'SecurityError') {
      throw new Error(
        '[exportPdfBlob] Canvas tainté (SecurityError) — une image est chargée sans CORS. ' +
        'Vérifiez que les images Firebase Storage ont les en-têtes CORS appropriés.',
        { cause: err },
      )
    }
    throw err
  }

  // Restaure l'état initial
  canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
  canvas.setDimensions({ width: origWidth, height: origHeight })
  hidden.forEach((o) => canvas.add(o))
  canvas.requestRenderAll()

  // PDF : page = dimensions de capture
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([captureWidth, captureHeight])

  // Fond blanc
  page.drawRectangle({
    x: 0, y: 0, width: captureWidth, height: captureHeight,
    color: rgb(1, 1, 1),
  })

  // Image canvas (avec bleed)
  const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
  const pngImage = await pdfDoc.embedPng(pngBytes)
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: captureWidth,
    height: captureHeight,
  })

  // Traits de coupe en L aux 4 coins de la zone trimmed
  if (withMarks) {
    const markLen = Math.max(8, Math.round(5 * (CANVAS_DPI / 25.4)))
    const markGap = Math.max(2, Math.round(2 * (CANVAS_DPI / 25.4)))
    const thickness = Math.max(1, Math.round(0.25 * (CANVAS_DPI / 25.4)))
    const markColor = rgb(0, 0, 0)

    const left = bleedPx
    const right = bleedPx + canvasWidth
    const top = captureHeight - bleedPx
    const bottom = bleedPx
    const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness,
        color: markColor,
      })
    }

    drawLine(left, top + markGap, left, top + markGap + markLen)
    drawLine(left - markGap, top, left - markGap - markLen, top)
    drawLine(right, top + markGap, right, top + markGap + markLen)
    drawLine(right + markGap, top, right + markGap + markLen, top)
    drawLine(left, bottom - markGap, left, bottom - markGap - markLen)
    drawLine(left - markGap, bottom, left - markGap - markLen, bottom)
    drawLine(right, bottom - markGap, right, bottom - markGap - markLen)
    drawLine(right + markGap, bottom, right + markGap + markLen, bottom)
  }

  // Couche texte invisible pour la recherche / sélection PDF
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const objects = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark)

  for (const obj of objects) {
    if (!(obj instanceof Textbox)) continue
    const text = obj.text ?? ''
    if (!text.trim()) continue

    const x = (obj.left ?? 0) + bleedPx
    const y = canvasHeight - (obj.top ?? 0) - (obj.height ?? 0) + bleedPx
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
      // Caractères non supportés → ignorés silencieusement
    }
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}

export function useExportPdf() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight, bleedMm } = useUIStore()

  const exportPdf = useCallback(
    async (opts: ExportPdfOptions = {}): Promise<void> => {
      const canvas = globalFabricCanvas
      if (!canvas) return

      const blob = await exportPdfBlob(canvas, {
        canvasWidth,
        canvasHeight,
        bleedMm,
        withPrintMarks: opts.withPrintMarks,
        multiplier: 2,
        title: projectTitle,
      })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = opts.withPrintMarks ? '_print' : ''
      a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}${suffix}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    },
    [projectTitle, canvasWidth, canvasHeight, bleedMm],
  )

  return { exportPdf }
}
