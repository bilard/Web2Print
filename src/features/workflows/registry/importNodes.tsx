// src/features/workflows/registry/importNodes.tsx
import { FileSpreadsheet, FileText, FileImage, Upload } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseExcelFile } from '@/features/excel/useExcelImport'

interface CsvConfig {
  headerRow: boolean
}

export const importCsvNode: NodeSpec<CsvConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-csv',
  category: 'import',
  label: 'Import CSV/Excel',
  description: "Charge un fichier .csv/.xlsx et produit une Sheet (premier onglet).",
  icon: FileSpreadsheet,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [
    { name: 'headerRow', kind: 'checkbox', label: 'Première ligne = en-têtes', default: true },
  ],
  defaultConfig: { headerRow: true },
  runtime: 'client',
  run: async (ctx, _config, inputs) => {
    if (!inputs.file) {
      ctx.log('error', 'Aucun fichier fourni')
      return { sheet: null }
    }
    ctx.log('info', `Parsing ${inputs.file.name}…`)
    const sheets = await parseExcelFile(inputs.file)
    ctx.log('info', `${sheets.length} onglet(s) parsé(s) — utilisation du premier`)
    return { sheet: sheets[0] ?? null }
  },
}

interface IdmlConfig {}

export const importIdmlNode: NodeSpec<IdmlConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-idml',
  category: 'import',
  label: 'Import IDML',
  description: 'Charge un .idml. (Phase 2 : produira une Sheet avec les métadonnées du document.)',
  icon: FileText,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run: async (ctx, _config, inputs) => {
    if (!inputs.file) {
      ctx.log('error', 'Aucun fichier fourni')
      return { sheet: null }
    }
    ctx.log('warn', 'Import IDML : stub — à wirer en phase 2 (parseIdml ne produit pas de Sheet directement)')
    return { sheet: { name: inputs.file.name, columns: [], rows: [] } }
  },
}

interface SvgConfig {}

export const importSvgNode: NodeSpec<SvgConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-svg',
  category: 'import',
  label: 'Import SVG',
  description: 'Charge un .svg. (Phase 2 : produira une Sheet avec les métadonnées du document.)',
  icon: FileImage,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run: async (ctx, _config, inputs) => {
    if (!inputs.file) {
      ctx.log('error', 'Aucun fichier fourni')
      return { sheet: null }
    }
    ctx.log('warn', 'Import SVG : stub — à wirer en phase 2 (parseSvgToFabric produit des objets canvas, pas des Sheet)')
    return { sheet: { name: inputs.file.name, columns: [], rows: [] } }
  },
}

interface UploadConfig { lastFileName: string }

export const uploadNode: NodeSpec<UploadConfig, Record<string, never>, { file: File | null }> = {
  type: 'upload',
  category: 'import',
  label: 'Upload',
  description: 'Sélectionne un fichier local. (MVP : fichier non persisté entre sessions.)',
  icon: Upload,
  inputs: [],
  outputs: [{ name: 'file', type: 'file' }],
  configSchema: [],
  defaultConfig: { lastFileName: '' },
  runtime: 'client',
  ConfigComponent: ({ config, onChange }) => (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const key = `wf_file_${Date.now()}_${f.name}`
          ;(window as unknown as { __workflowFiles?: Map<string, File> }).__workflowFiles ??= new Map()
          ;(window as unknown as { __workflowFiles: Map<string, File> }).__workflowFiles.set(key, f)
          onChange({ ...config, lastFileName: key })
        }}
        className="text-xs text-neutral-300 w-full"
      />
      <div className="text-[10px] text-neutral-500 mt-1 truncate">
        {config.lastFileName ? config.lastFileName.replace(/^wf_file_\d+_/, '') : 'Aucun fichier'}
      </div>
    </div>
  ),
  run: async (ctx, config) => {
    const map = (window as unknown as { __workflowFiles?: Map<string, File> }).__workflowFiles
    const f = map?.get(config.lastFileName)
    if (!f) {
      ctx.log('warn', `Aucun fichier trouvé en mémoire pour la clé "${config.lastFileName}"`)
      return { file: null }
    }
    ctx.log('info', `Fichier prêt : ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)
    return { file: f }
  },
}

nodeRegistry.register(importCsvNode)
nodeRegistry.register(importIdmlNode)
nodeRegistry.register(importSvgNode)
nodeRegistry.register(uploadNode)
