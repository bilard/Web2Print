// src/features/workflows/registry/importNodes.tsx
import { useState, useEffect } from 'react'
import { FileSpreadsheet, FileText, FileImage, Upload } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseExcelFile } from '@/features/excel/useExcelImport'
import { putFile, getFile } from '../runtime/fileStore'

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
      throw new Error('Aucun fichier fourni — connectez un Upload ou un autre node produisant un fichier.')
    }
    ctx.log('info', `Parsing ${inputs.file.name}…`)
    const sheets = await parseExcelFile(inputs.file)
    if (sheets.length === 0) {
      throw new Error('Le fichier ne contient aucun onglet exploitable.')
    }
    ctx.log('info', `${sheets.length} onglet(s) parsé(s) — utilisation du premier`)
    return { sheet: sheets[0] }
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
      throw new Error('Aucun fichier fourni — connectez un Upload.')
    }
    ctx.log('warn', 'Import IDML : stub — produit une Sheet vide. À wirer en phase 2.')
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
      throw new Error('Aucun fichier fourni — connectez un Upload.')
    }
    ctx.log('warn', 'Import SVG : stub — produit une Sheet vide. À wirer en phase 2.')
    return { sheet: { name: inputs.file.name, columns: [], rows: [] } }
  },
}

interface UploadConfig {
  fileKey: string
  fileName: string
  fileSize: number
}

interface UploadConfigUiProps {
  config: UploadConfig
  onChange: (next: UploadConfig) => void
}

function UploadConfigUi({ config, onChange }: UploadConfigUiProps) {
  const [exists, setExists] = useState<boolean | null>(null)
  useEffect(() => {
    if (!config.fileKey) {
      setExists(null)
      return
    }
    getFile(config.fileKey)
      .then((f) => setExists(!!f))
      .catch(() => setExists(false))
  }, [config.fileKey])

  return (
    <div className="space-y-1.5">
      <input
        type="file"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const key = `wf_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          await putFile(key, f)
          onChange({ fileKey: key, fileName: f.name, fileSize: f.size })
        }}
        className="text-xs text-neutral-300 w-full"
      />
      {config.fileName ? (
        <div className="text-[10px] text-neutral-500 truncate">
          <span className="text-neutral-400">{config.fileName}</span>
          <span className="ml-1">· {(config.fileSize / 1024).toFixed(1)} KB</span>
          {exists === false ? (
            <span className="ml-1 text-amber-400">· fichier introuvable, re-sélectionnez</span>
          ) : exists === true ? (
            <span className="ml-1 text-emerald-400">· OK</span>
          ) : null}
        </div>
      ) : (
        <div className="text-[10px] text-neutral-600">Aucun fichier sélectionné</div>
      )}
    </div>
  )
}

export const uploadNode: NodeSpec<UploadConfig, Record<string, never>, { file: File }> = {
  type: 'upload',
  category: 'import',
  label: 'Upload',
  description: 'Sélectionne un fichier local (persisté en IndexedDB côté navigateur).',
  icon: Upload,
  inputs: [],
  outputs: [{ name: 'file', type: 'file' }],
  configSchema: [],
  defaultConfig: { fileKey: '', fileName: '', fileSize: 0 },
  runtime: 'client',
  ConfigComponent: UploadConfigUi,
  run: async (ctx, config) => {
    if (!config.fileKey) {
      throw new Error('Aucun fichier sélectionné — ouvrez la config du node Upload pour en choisir un.')
    }
    const f = await getFile(config.fileKey)
    if (!f) {
      throw new Error(
        `Fichier "${config.fileName}" introuvable en stockage local — il a été supprimé ou cet ordinateur ne le contient pas. Re-sélectionnez-le.`,
      )
    }
    ctx.log('info', `Fichier prêt : ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)
    return { file: f }
  },
}

nodeRegistry.register(importCsvNode)
nodeRegistry.register(importIdmlNode)
nodeRegistry.register(importSvgNode)
nodeRegistry.register(uploadNode)
