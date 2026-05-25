// src/features/workflows/registry/exportNodes.ts
import { FileDown, Presentation, FileType2, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import PptxGenJS from 'pptxgenjs'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { Canvas } from 'fabric'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { exportPngBlob } from '@/features/export/useExportPng'
import { exportPdfBlob } from '@/features/export/useExportPdf'
import { exportPptxBlob } from '@/features/export/useExportPptx'
import { exportHtmlBlob } from '@/features/export/useExportHtml'
import { generateSvgFromCanvas } from '@/features/export/useExportSvg'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'

interface SheetInput {
  sheet: {
    name?: string
    rows?: Array<Record<string, unknown>>
    columns?: Array<{ key: string; label?: string }>
    [key: string]: unknown
  } | null
}

interface ExportResult {
  url: string
  mime: string
  filename: string
}

// ---------------------------------------------------------------------------
// Export Excel
// ---------------------------------------------------------------------------

interface ExportXlsxConfig {
  columns: string
}

export const exportExcelNode: NodeSpec<
  ExportXlsxConfig,
  SheetInput,
  { result: ExportResult }
> = {
  type: 'export-excel',
  category: 'export',
  label: 'Export Excel',
  description: 'Génère un .xlsx depuis une Sheet.',
  icon: FileDown,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [
    {
      name: 'columns',
      kind: 'text',
      label: 'Colonnes (séparées par virgule, vide = toutes)',
      default: '',
    },
  ],
  defaultConfig: { columns: '' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const rows = (inputs.sheet?.rows ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      throw new Error(
        "La Sheet d'entrée n'a aucune ligne — vérifiez que le node amont a bien produit des données.",
      )
    }

    const filterCols = config.columns
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const filteredRows = filterCols.length
      ? rows.map((r) =>
          Object.fromEntries(filterCols.map((c) => [c, r[c]])),
        )
      : rows

    const ws = XLSX.utils.json_to_sheet(filteredRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, inputs.sheet?.name ?? 'Sheet1')

    // XLSX.write with type:'array' returns a Uint8Array
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    const blob = new Blob([new Uint8Array(data)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const filename = `export-${Date.now()}.xlsx`

    ctx.log('info', `${rows.length} rows → ${filename}`)
    return { result: { url, mime: blob.type, filename } }
  },
}

// ---------------------------------------------------------------------------
// Export PPTX
// ---------------------------------------------------------------------------

interface ExportPptxConfig {
  titleColumn: string
}

export const exportPptxNode: NodeSpec<
  ExportPptxConfig,
  SheetInput,
  { result: ExportResult }
> = {
  type: 'export-pptx',
  category: 'export',
  label: 'Export PPTX',
  description: 'Génère un .pptx avec une slide par row (MVP minimal).',
  icon: Presentation,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [
    {
      name: 'titleColumn',
      kind: 'text',
      label: 'Colonne pour le titre des slides',
      default: 'title',
    },
  ],
  defaultConfig: { titleColumn: 'title' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const rows = (inputs.sheet?.rows ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      throw new Error(
        "La Sheet d'entrée n'a aucune ligne — vérifiez que le node amont a bien produit des données.",
      )
    }

    const pres = new PptxGenJS()
    pres.layout = 'LAYOUT_16x9'

    for (const row of rows) {
      const slide = pres.addSlide()
      const title = String(row[config.titleColumn] ?? 'Slide')
      slide.addText(title, {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.8,
        fontSize: 24,
        bold: true,
      })
      let y = 1.2
      for (const [k, v] of Object.entries(row)) {
        if (k === config.titleColumn) continue
        slide.addText(`${k}: ${String(v ?? '')}`, {
          x: 0.5,
          y,
          w: 9,
          h: 0.4,
          fontSize: 12,
        })
        y += 0.4
        if (y > 6.5) break
      }
    }

    // pres.write returns Promise<string | ArrayBuffer | Blob | Uint8Array>
    // with outputType:'blob' it resolves to a Blob
    const output = await pres.write({ outputType: 'blob' })
    const blob = output instanceof Blob ? output : new Blob([output as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    const url = URL.createObjectURL(blob)
    const filename = `export-${Date.now()}.pptx`

    ctx.log('info', `${rows.length} slides → ${filename}`)
    return {
      result: {
        url,
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        filename,
      },
    }
  },
}

// ---------------------------------------------------------------------------
// Export HTML → PDF
// ---------------------------------------------------------------------------

interface ExportPdfConfig {
  /** Gabarit HTML interpolé une fois par row. Placeholders `{{column}}`. */
  template: string
  /** A4 portrait/paysage. */
  orientation: 'portrait' | 'landscape'
  /** Une page par row (true) ou tout enchaîné (false). */
  pageBreakPerRow: boolean
}

const DEFAULT_PDF_TEMPLATE = `<div class="page">
  <h1>{{title}}</h1>
  <p><strong>Marque :</strong> {{brand}}</p>
  <p><strong>Modèle :</strong> {{model}}</p>
  <p>{{description}}</p>
</div>`

function interpolate(tpl: string, row: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => {
    const v = row[key]
    if (v === null || v === undefined) return ''
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  })
}

export const exportPdfNode: NodeSpec<
  ExportPdfConfig,
  SheetInput,
  { result: ExportResult }
> = {
  type: 'export-pdf',
  category: 'export',
  label: 'Export HTML → PDF',
  description:
    'Rend un gabarit HTML par row (placeholders {{colonne}}) et génère un PDF multi-pages.',
  icon: FileType2,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [
    {
      name: 'template',
      kind: 'textarea',
      label: 'Gabarit HTML (placeholders {{colonne}})',
      default: DEFAULT_PDF_TEMPLATE,
    },
    {
      name: 'orientation',
      kind: 'select',
      label: 'Orientation',
      options: [
        { value: 'portrait', label: 'Portrait' },
        { value: 'landscape', label: 'Paysage' },
      ],
      default: 'portrait',
    },
    {
      name: 'pageBreakPerRow',
      kind: 'checkbox',
      label: 'Une page par ligne',
      default: true,
    },
  ],
  defaultConfig: {
    template: DEFAULT_PDF_TEMPLATE,
    orientation: 'portrait',
    pageBreakPerRow: true,
  },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const rows = (inputs.sheet?.rows ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      throw new Error(
        "La Sheet d'entrée n'a aucune ligne — vérifiez que le node amont a bien produit des données.",
      )
    }

    // Build a sandbox iframe to isolate the rendered HTML from the host page CSS.
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.left = '-99999px'
    iframe.style.top = '0'
    iframe.style.width = config.orientation === 'portrait' ? '794px' : '1123px' // A4 @ 96dpi
    iframe.style.height = '10px'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    try {
      const doc = iframe.contentDocument
      if (!doc) throw new Error('Impossible de créer le contexte de rendu PDF.')

      const sheetsHtml = rows
        .map((row, idx) => {
          const html = interpolate(config.template, row)
          return `<section class="row" data-idx="${idx}">${html}</section>`
        })
        .join(config.pageBreakPerRow ? '<div class="break"></div>' : '')

      doc.open()
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; background: #fff; }
        .row { padding: 0; }
        .break { page-break-after: always; height: 0; }
        h1 { font-size: 22px; margin: 0 0 8px; }
        h2 { font-size: 18px; margin: 16px 0 8px; }
        p { margin: 4px 0; line-height: 1.4; font-size: 13px; }
        img { max-width: 100%; height: auto; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
      </style></head><body>${sheetsHtml}</body></html>`)
      doc.close()

      // Wait one tick so layout settles and any data-URL images decode.
      await new Promise((r) => setTimeout(r, 50))

      const pdf = new jsPDF({
        orientation: config.orientation,
        unit: 'pt',
        format: 'a4',
      })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const sections = config.pageBreakPerRow
        ? Array.from(doc.querySelectorAll<HTMLElement>('section.row'))
        : [doc.body]

      for (let i = 0; i < sections.length; i++) {
        const el = sections[i]
        ctx.log('info', `Rendu page ${i + 1}/${sections.length}…`)
        const canvas = await html2canvas(el, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false,
          useCORS: true,
        })
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        const ratio = canvas.width / canvas.height
        let w = pageWidth - 48
        let h = w / ratio
        if (h > pageHeight - 48) {
          h = pageHeight - 48
          w = h * ratio
        }
        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', (pageWidth - w) / 2, 24, w, h)
      }

      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      const filename = `export-${Date.now()}.pdf`
      ctx.log('info', `${sections.length} page(s) → ${filename}`)
      return { result: { url, mime: 'application/pdf', filename } }
    } finally {
      iframe.remove()
    }
  },
}

// ---------------------------------------------------------------------------
// Export Design — rend un SVG (issu de image-to-svg / pdf-to-svg) dans le
// format choisi (PNG/PDF/PPTX/HTML/SVG) via les cœurs d'export de l'éditeur.
// ---------------------------------------------------------------------------

type DesignFormat = 'png' | 'pdf' | 'pptx' | 'html' | 'svg'
type DesignResolution = '72' | '150' | '300'

interface ExportDesignConfig {
  format: DesignFormat
  resolution: DesignResolution
}

interface FileInput {
  file?: File | Blob | null
}

/**
 * Inline les `<image href="http(s)://…">` en data URI pour éviter que le canvas
 * Fabric ne soit tainté CORS lors de l'accès à toDataURL.
 * Conservé car parseSvgToFabric charge les images via <img> : sans pré-inlining,
 * toDataURL() peut lancer SecurityError sur les images Firebase sans CORS.
 */
async function inlineExternalImages(svgText: string): Promise<string> {
  const urls = Array.from(
    svgText.matchAll(/(?:xlink:href|href)\s*=\s*"(https?:\/\/[^"]+)"/g),
    (m) => m[1],
  )
  let out = svgText
  for (const rawUrl of Array.from(new Set(urls))) {
    // L'URL extraite du SVG est XML-échappée (&amp;) : on la décode pour le fetch,
    // sinon le param `token` Firebase est cassé → 403. On garde `rawUrl` (échappée)
    // pour le remplacement, car c'est cette forme qui apparaît dans le texte SVG.
    const fetchUrl = rawUrl.replace(/&amp;/g, '&')
    try {
      const resp = await fetch(fetchUrl)
      if (!resp.ok) {
        console.warn(`[exportDesign] Image inaccessible (${resp.status}) : ${fetchUrl}`)
        continue
      }
      const blob = await resp.blob()
      const dataUri = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result as string)
        fr.onerror = () => reject(new Error('Lecture de l\'image échouée.'))
        fr.readAsDataURL(blob)
      })
      out = out.split(rawUrl).join(dataUri)
    } catch (err) {
      console.warn(`[exportDesign] Impossible d'inliner l'image ${fetchUrl} :`, err)
    }
  }
  return out
}

/**
 * Construit un canvas Fabric offscreen depuis un SVG texte.
 * Les images externes doivent être pré-inlinées pour éviter les CORS taints.
 */
async function buildOffscreenCanvas(svgText: string): Promise<{ canvas: Canvas; width: number; height: number }> {
  const { objects, width, height } = await parseSvgToFabric(svgText)

  const el = document.createElement('canvas')
  el.width = width
  el.height = height

  const canvas = new Canvas(el, {
    width,
    height,
    renderOnAddRemove: false,
  })

  canvas.add(...objects)

  // Attendre que les FabricImage (chargées async) soient prêtes
  await new Promise<void>((resolve) => setTimeout(resolve, 150))
  canvas.requestRenderAll()

  return { canvas, width, height }
}

export const exportDesignNode: NodeSpec<ExportDesignConfig, FileInput, { file: File; result: ExportResult }> = {
  type: 'export-design',
  category: 'export',
  label: 'Export (design)',
  description:
    'Exporte un design SVG (issu de Image→SVG / PDF→SVG) dans le format choisi : PNG, PDF, PPTX, HTML ou SVG. Sort le fichier produit (port "file", à connecter vers Drive ou la pièce jointe Gmail) + un résultat téléchargeable.',
  icon: Download,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [
    { name: 'file', type: 'file' },
    { name: 'result', type: 'export-result' },
  ],
  configSchema: [
    {
      name: 'format',
      kind: 'select',
      label: 'Format de sortie',
      options: [
        { value: 'png', label: 'PNG (image haute résolution)' },
        { value: 'pdf', label: 'PDF (document imprimable)' },
        { value: 'pptx', label: 'PowerPoint (.pptx)' },
        { value: 'html', label: 'HTML (page autonome)' },
        { value: 'svg', label: 'SVG (vectoriel éditable)' },
      ],
      default: 'png',
    },
    {
      name: 'resolution',
      kind: 'select',
      label: 'Résolution (PNG / PDF / PPTX)',
      options: [
        { value: '72', label: '72 dpi (écran)' },
        { value: '150', label: '150 dpi (standard)' },
        { value: '300', label: '300 dpi (impression)' },
      ],
      default: '150',
    },
  ],
  defaultConfig: { format: 'png', resolution: '150' },
  runtime: 'client',
  run: async (ctx, config, inputs) => {
    const file = inputs.file
    if (!(file instanceof Blob)) {
      throw new Error('Aucun design en entrée — connectez la sortie SVG de « Image → SVG » ou « PDF → SVG ».')
    }
    const svgText = await file.text()
    const baseName = ((file as File).name || 'design').replace(/\.[^.]+$/, '') || 'design'
    const stamp = Date.now()
    const dpi = Number(config.resolution) || 150
    const multiplier = dpi / 72

    const finish = (out: Blob, ext: string): { file: File; result: ExportResult } => {
      const filename = `${baseName}-${stamp}.${ext}`
      const outFile = out instanceof File ? out : new File([out], filename, { type: out.type })
      const url = URL.createObjectURL(out)
      ctx.log('info', `Export ${config.format.toUpperCase()} ${dpi} dpi → ${filename}`)
      return { file: outFile, result: { url, mime: out.type, filename } }
    }

    // SVG : renvoie le fichier source tel quel (déjà vectoriel)
    if (config.format === 'svg') {
      return finish(new Blob([svgText], { type: 'image/svg+xml' }), 'svg')
    }

    // Pour tous les autres formats : pré-inliner les images externes (prophylaxie CORS)
    ctx.log('info', 'Inlinage des images externes…')
    const inlinedSvg = await inlineExternalImages(svgText)

    // Construire le canvas Fabric offscreen
    ctx.log('info', 'Construction du canvas Fabric…')
    let fabricCanvas: Canvas
    let width: number
    let height: number
    try {
      const result = await buildOffscreenCanvas(inlinedSvg)
      fabricCanvas = result.canvas
      width = result.width
      height = result.height
    } catch (err) {
      throw new Error(`Impossible de parser le SVG en canvas Fabric : ${String(err)}`)
    }

    ctx.log('info', `Canvas ${width}×${height} — export ${config.format.toUpperCase()} ${dpi} dpi…`)

    try {
      if (config.format === 'html') {
        const blob = await exportHtmlBlob(fabricCanvas, {
          canvasWidth: width,
          canvasHeight: height,
          title: baseName,
        })
        return finish(blob, 'zip')
      }

      if (config.format === 'png') {
        try {
          const blob = await exportPngBlob(fabricCanvas, dpi)
          return finish(blob, 'png')
        } catch (err) {
          ctx.log('error', `[exportDesign] PNG échoué : ${String(err)}`)
          throw err
        }
      }

      if (config.format === 'pdf') {
        try {
          const blob = await exportPdfBlob(fabricCanvas, {
            canvasWidth: width,
            canvasHeight: height,
            multiplier,
            title: baseName,
          })
          return finish(blob, 'pdf')
        } catch (err) {
          ctx.log('error', `[exportDesign] PDF échoué : ${String(err)}`)
          throw err
        }
      }

      if (config.format === 'pptx') {
        try {
          const blob = await exportPptxBlob(fabricCanvas, {
            canvasWidth: width,
            canvasHeight: height,
            multiplier,
            title: baseName,
          })
          return finish(blob, 'pptx')
        } catch (err) {
          ctx.log('error', `[exportDesign] PPTX échoué : ${String(err)}`)
          throw err
        }
      }

      // Ne devrait pas arriver (TS exhaustive check)
      throw new Error(`Format non supporté : ${config.format}`)
    } finally {
      // Nettoyage du canvas offscreen
      fabricCanvas.dispose()
    }
  },
}

nodeRegistry.register(exportExcelNode)
nodeRegistry.register(exportPptxNode)
nodeRegistry.register(exportPdfNode)
nodeRegistry.register(exportDesignNode)
