// src/features/workflows/registry/importNodes.tsx
import { useState, useEffect, useRef } from 'react'
import {
  FileSpreadsheet,
  FileText,
  FileImage,
  Upload,
  File as FileIcon,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseExcelFile } from '@/features/excel/useExcelImport'
import { putFile, getFile, deleteFile } from '../runtime/fileStore'

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fileExtIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['csv', 'xlsx', 'xls', 'tsv'].includes(ext)) return FileSpreadsheet
  if (['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return FileImage
  if (['idml', 'pdf', 'doc', 'docx'].includes(ext)) return FileText
  return FileIcon
}

function UploadConfigUi({ config, onChange }: UploadConfigUiProps) {
  const [exists, setExists] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!config.fileKey) {
      setExists(null)
      return
    }
    getFile(config.fileKey)
      .then((f) => setExists(!!f))
      .catch(() => setExists(false))
  }, [config.fileKey])

  const onPick = async (f: File) => {
    const key = `wf_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await putFile(key, f)
    if (config.fileKey) await deleteFile(config.fileKey).catch(() => {})
    onChange({ fileKey: key, fileName: f.name, fileSize: f.size })
  }

  const onClear = async () => {
    if (config.fileKey) await deleteFile(config.fileKey).catch(() => {})
    onChange({ fileKey: '', fileName: '', fileSize: 0 })
  }

  const Icon = config.fileName ? fileExtIcon(config.fileName) : FileIcon
  const hasFile = !!config.fileName
  const ok = hasFile && exists === true
  const missing = hasFile && exists === false

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) await onPick(f)
        }}
      />

      {!hasFile ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) await onPick(f)
          }}
          className={`w-full flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-md border-2 border-dashed transition-colors ${
            dragOver
              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
              : 'border-neutral-700 bg-[#0f0f0f] text-neutral-400 hover:border-neutral-600 hover:text-neutral-300'
          }`}
        >
          <Upload className="w-5 h-5" />
          <span className="text-[11px]">Cliquer ou déposer un fichier</span>
        </button>
      ) : (
        <div
          className={`relative flex items-center gap-2 p-2 rounded-md border ${
            missing
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-neutral-700 bg-[#161616]'
          }`}
        >
          <div
            className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center border ${
              missing
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-[12px] text-white truncate"
              title={config.fileName}
            >
              {config.fileName}
            </div>
            <div className="text-[10px] text-neutral-500 flex items-center gap-1.5 mt-0.5">
              <span>{formatBytes(config.fileSize)}</span>
              {ok ? (
                <span className="flex items-center gap-0.5 text-emerald-400">
                  <CheckCircle2 className="w-2.5 h-2.5" /> prêt
                </span>
              ) : missing ? (
                <span className="flex items-center gap-0.5 text-amber-400">
                  <AlertTriangle className="w-2.5 h-2.5" /> introuvable
                </span>
              ) : (
                <span className="text-neutral-600">vérification…</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5"
            title="Retirer le fichier"
            aria-label="Retirer le fichier"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {hasFile ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full text-[11px] text-neutral-400 hover:text-white py-1 rounded hover:bg-white/5 transition-colors"
        >
          Remplacer le fichier
        </button>
      ) : null}
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
