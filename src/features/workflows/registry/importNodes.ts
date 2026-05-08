// src/features/workflows/registry/importNodes.ts
import { FileSpreadsheet, FileText, FileImage } from 'lucide-react'
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

nodeRegistry.register(importCsvNode)
nodeRegistry.register(importIdmlNode)
nodeRegistry.register(importSvgNode)
