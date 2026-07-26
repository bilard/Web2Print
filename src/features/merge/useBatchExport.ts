import { useCallback, useRef, useState } from 'react'
import { PDFDocument, rgb } from 'pdf-lib'
import PptxGenJS from 'pptxgenjs'
import JSZip from 'jszip'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore, type MergeRow } from '@/stores/merge.store'
import { useDataMerge } from './useDataMerge'
import { resolveFileName } from './mergeEngine'
import { recordAudit } from '@/lib/auditLog'
import { exportPngBlob } from '@/features/export/useExportPng'
import { exportPdfBlob } from '@/features/export/useExportPdf'

export type ExportFormat = 'pdf' | 'pptx' | 'png'
export type ExportMode = 'multi-page' | 'zip'

export interface BatchExportConfig {
  format: ExportFormat
  mode: ExportMode
  rangeStart: number     // 0-indexed
  rangeEnd: number       // 0-indexed inclusive
  fileNamePattern: string // ex: "carte_{{nom}}"
  dpi?: 72 | 150 | 300        // défaut 150 — résolution PNG/PDF par ligne
  withPrintMarks?: boolean    // défaut false — marques de coupe (PDF zip uniquement)
}

/** Convertit un DPI en multiplicateur Fabric (base 72 px/inch). */
export function dpiToMultiplier(dpi: 72 | 150 | 300 | undefined): number {
  return (dpi ?? 150) / 72
}

export function useBatchExport() {
  const { canvasWidth, canvasHeight } = useUIStore()
  const projectTitle = useEditorStore((s) => s.projectTitle)
  const { rows } = useMergeStore()
  const { applyRow } = useDataMerge()

  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(0)
  const [isExporting, setIsExporting] = useState(false)
  const cancelledRef = useRef(false)

  const captureCanvas = useCallback((): string => {
    const canvas = globalFabricCanvas
    if (!canvas) return ''

    const origVpt = [...(canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0])]
    const origW = canvas.getWidth()
    const origH = canvas.getHeight()

    canvas.discardActiveObject()
    const gridObjs = canvas.getObjects().filter((o) => o.data?.isGrid)
    gridObjs.forEach((o) => canvas.remove(o))

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight })
    canvas.requestRenderAll()

    const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 2, quality: 1 })

    canvas.setViewportTransform(origVpt as [number, number, number, number, number, number])
    canvas.setDimensions({ width: origW, height: origH })
    gridObjs.forEach((o) => canvas.add(o))
    canvas.requestRenderAll()

    return dataUrl
  }, [canvasWidth, canvasHeight])

  const exportBatch = useCallback(async (config: BatchExportConfig) => {
    const selectedRows = rows.slice(config.rangeStart, config.rangeEnd + 1)
    if (selectedRows.length === 0) return

    setIsExporting(true)
    setProgress(0)
    setTotal(selectedRows.length)
    cancelledRef.current = false

    try {
      if (config.mode === 'multi-page' && config.format === 'pdf') {
        await exportMultiPagePdf(selectedRows, config)
      } else {
        await exportZip(selectedRows, config)
      }
      recordAudit({ action: 'export.batch', module: 'export', meta: { format: config.format, rows: selectedRows.length } })
    } finally {
      setIsExporting(false)
      setProgress(0)
      setTotal(0)
    }
  }, [rows])

  const exportMultiPagePdf = useCallback(async (
    selectedRows: MergeRow[],
    _config: BatchExportConfig
  ) => {
    const pdfDoc = await PDFDocument.create()

    for (let i = 0; i < selectedRows.length; i++) {
      if (cancelledRef.current) break

      await applyRow(selectedRows[i])
      await new Promise((r) => setTimeout(r, 50))

      const dataUrl = captureCanvas()
      const pngBytes = await fetch(dataUrl).then((r) => r.arrayBuffer())
      const pngImage = await pdfDoc.embedPng(pngBytes)

      const page = pdfDoc.addPage([canvasWidth, canvasHeight])
      page.drawRectangle({ x: 0, y: 0, width: canvasWidth, height: canvasHeight, color: rgb(1, 1, 1) })
      page.drawImage(pngImage, { x: 0, y: 0, width: canvasWidth, height: canvasHeight })

      setProgress(i + 1)
    }

    if (!cancelledRef.current) {
      const pdfBytes = await pdfDoc.save()
      downloadBlob(
        new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
        `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_merge.pdf`
      )
    }
  }, [applyRow, captureCanvas, canvasWidth, canvasHeight, projectTitle])

  const exportZip = useCallback(async (
    selectedRows: MergeRow[],
    config: BatchExportConfig
  ) => {
    const zip = new JSZip()
    const pxToIn = (px: number) => px / 96

    for (let i = 0; i < selectedRows.length; i++) {
      if (cancelledRef.current) break

      const row = selectedRows[i]
      await applyRow(row)
      await new Promise((r) => setTimeout(r, 50))

      const fileName = resolveFileName(config.fileNamePattern || `export_${i + 1}`, row, useMergeStore.getState().columns)

      if (config.format === 'png') {
        if (!globalFabricCanvas) continue
        const blob = await exportPngBlob(globalFabricCanvas, config.dpi ?? 150)
        zip.file(`${fileName}.png`, new Uint8Array(await blob.arrayBuffer()))

      } else if (config.format === 'pdf') {
        if (!globalFabricCanvas) continue
        const blob = await exportPdfBlob(globalFabricCanvas, {
          canvasWidth,
          canvasHeight,
          withPrintMarks: config.withPrintMarks ?? false,
          multiplier: dpiToMultiplier(config.dpi),
        })
        zip.file(`${fileName}.pdf`, new Uint8Array(await blob.arrayBuffer()))

      } else if (config.format === 'pptx') {
        // V1 : pptx et multi-page PDF conservent captureCanvas (multiplier fixe) — marques non requises
        const pptx = new PptxGenJS()
        const slideW = pxToIn(canvasWidth)
        const slideH = pxToIn(canvasHeight)
        pptx.defineLayout({ name: 'MERGE', width: slideW, height: slideH })
        pptx.layout = 'MERGE'
        const slide = pptx.addSlide()
        slide.background = { fill: 'FFFFFF' }
        const dataUrl = captureCanvas()
        slide.addImage({ data: dataUrl, x: 0, y: 0, w: slideW, h: slideH })
        const pptxBlob = await pptx.write({ outputType: 'blob' }) as Blob
        zip.file(`${fileName}.pptx`, pptxBlob)
      }

      setProgress(i + 1)
    }

    if (!cancelledRef.current) {
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBlob, `${projectTitle.replace(/[^a-z0-9]/gi, '_')}_merge.zip`)
    }
  }, [applyRow, captureCanvas, canvasWidth, canvasHeight, projectTitle])

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  return {
    exportBatch,
    cancel,
    isExporting,
    progress,
    total,
  }
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
