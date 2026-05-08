// src/features/workflows/registry/exportNodes.ts
import { FileDown, Presentation, FileType2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import PptxGenJS from 'pptxgenjs'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
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

nodeRegistry.register(exportExcelNode)
nodeRegistry.register(exportPptxNode)
nodeRegistry.register(exportPdfNode)
