import { useCallback } from 'react'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Textbox } from 'fabric'
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

export function useExportPdf() {
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { canvasWidth, canvasHeight, bleedMm } = useUIStore()

  const exportPdf = useCallback(
    async (opts: ExportPdfOptions = {}): Promise<void> => {
      const canvas = globalFabricCanvas
      if (!canvas) return

      const withMarks = !!opts.withPrintMarks
      // La page PDF est en pt (1 px canvas = 1 pt) — bleed et marks suivent
      // la même unité, donc conversion mm via CANVAS_DPI (72).
      const bleedPx = withMarks ? Math.round(bleedMm * (CANVAS_DPI / 25.4)) : 0
      const captureWidth = canvasWidth + 2 * bleedPx
      const captureHeight = canvasHeight + 2 * bleedPx

      // Sauvegarde de l'état viewport
      const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
      const origWidth = canvas.getWidth()
      const origHeight = canvas.getHeight()

      canvas.discardActiveObject()
      canvas.requestRenderAll()

      // Cache : grille + repères visuels (trait de coupe + safe-area) — pour les
      // remplacer par des marks vectoriels propres dessinés directement dans le PDF.
      const hidden = canvas.getObjects().filter((o) => o.data?.isGrid || o.data?.isPrintMark)
      hidden.forEach((o) => canvas.remove(o))

      // Centre la viewport sur la zone à capturer (canvas + bleed sur 4 côtés).
      canvas.setViewportTransform([1, 0, 0, 1, bleedPx, bleedPx])
      canvas.setDimensions({ width: captureWidth, height: captureHeight })
      canvas.requestRenderAll()

      const multiplier = 2
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier, quality: 1 })

      // Restaure l'état initial
      canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
      canvas.setDimensions({ width: origWidth, height: origHeight })
      hidden.forEach((o) => canvas.add(o))
      canvas.requestRenderAll()

      // PDF : page = dimensions de capture (1 px canvas = 1 pt PDF par convention héritée).
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
        const markLen = Math.max(8, Math.round(5 * (CANVAS_DPI / 25.4)))    // 5 mm
        const markGap = Math.max(2, Math.round(2 * (CANVAS_DPI / 25.4)))    // 2 mm de gap depuis le bord trimmed
        const thickness = Math.max(1, Math.round(0.25 * (CANVAS_DPI / 25.4)))
        const markColor = rgb(0, 0, 0)

        const left = bleedPx
        const right = bleedPx + canvasWidth
        const top = captureHeight - bleedPx        // PDF y-up
        const bottom = bleedPx                     // PDF y-up
        const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness,
            color: markColor,
          })
        }

        // Top-left : trait vertical (vers le haut) + horizontal (vers la gauche)
        drawLine(left, top + markGap, left, top + markGap + markLen)
        drawLine(left - markGap, top, left - markGap - markLen, top)
        // Top-right
        drawLine(right, top + markGap, right, top + markGap + markLen)
        drawLine(right + markGap, top, right + markGap + markLen, top)
        // Bottom-left
        drawLine(left, bottom - markGap, left, bottom - markGap - markLen)
        drawLine(left - markGap, bottom, left - markGap - markLen, bottom)
        // Bottom-right
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
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = withMarks ? '_print' : ''
      a.download = `${projectTitle.replace(/[^a-z0-9]/gi, '_')}${suffix}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    },
    [projectTitle, canvasWidth, canvasHeight, bleedMm],
  )

  return { exportPdf }
}
