// src/features/workflows/registry/exportNodes.ts
import { FileDown, Presentation } from 'lucide-react'
import * as XLSX from 'xlsx'
import PptxGenJS from 'pptxgenjs'
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
    const emptyResult: ExportResult = {
      url: '',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: 'empty.xlsx',
    }

    const rows = (inputs.sheet?.rows ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      ctx.log('warn', 'Sheet sans rows — export annulé')
      return { result: emptyResult }
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
    const blob = new Blob([data], {
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

nodeRegistry.register(exportExcelNode)
nodeRegistry.register(exportPptxNode)
