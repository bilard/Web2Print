// src/features/workflows/registry/importNodes.tsx
import { useState, useEffect, useId } from 'react'
import {
  FileSpreadsheet,
  FileText,
  FileImage,
  Upload,
  File as FileIcon,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { parseExcelFile } from '@/features/excel/useExcelImport'
import { putFile, getFile, deleteFile, putFiles, getFiles } from '../runtime/fileStore'
import { traverseDataTransfer, dataTransferHasDirectory } from '@/lib/dragdrop'
import { detectAssemblyFiles, summarizeAssembly } from '@/features/idml/assemblyLoader'
import type { IdmlSummary } from '@/features/idml/assemblyLoader'
import { usePreviewFocus } from '../editor/previewFocus.store'

interface CsvConfig {
  headerRow: boolean
}

export const importCsvNode: NodeSpec<CsvConfig, { file: File }, { sheet: unknown }> = {
  type: 'import-csv',
  category: 'import',
  label: 'Parser Excel/CSV',
  description: "Transformateur : prend un fichier .csv/.xlsx en entrée et produit une Sheet (premier onglet).",
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

export const importIdmlNode: NodeSpec<IdmlConfig, { file?: File; files?: File[] }, { sheet: unknown }> = {
  type: 'import-idml',
  category: 'import',
  label: 'Import IDML',
  description:
    "Charge un .idml seul (port 'file') ou un dossier Assembly complet avec PDF + fonts + Links (port 'files').",
  icon: FileText,
  inputs: [
    { name: 'file', type: 'file' },
    { name: 'files', type: 'files' },
  ],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [],
  defaultConfig: {},
  runtime: 'client',
  run: async (ctx, _config, inputs) => {
    if (inputs.files && inputs.files.length > 0) {
      const assembly = detectAssemblyFiles(inputs.files)
      if (!assembly.idmlFile) {
        throw new Error('Aucun fichier .idml détecté dans le dossier fourni.')
      }
      ctx.log(
        'info',
        `Assembly détecté : 1 .idml, ${assembly.pdfFile ? '1 PDF' : 'pas de PDF'}, ${assembly.fontFiles.length} fonts, ${assembly.imageFiles.length} images.`,
      )
      ctx.log('warn', 'Import IDML : stub — produit une Sheet vide. À wirer en phase 2.')
      return { sheet: { name: assembly.idmlFile.name, columns: [], rows: [] } }
    }
    if (!inputs.file) {
      throw new Error("Aucun fichier fourni — connectez un node Upload (mode Fichier ou Dossier).")
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

interface CsvSummary {
  columns: string[]
  rowCount: number
  sheetName: string
}

interface UploadConfig {
  fileKey: string
  fileName: string
  fileSize: number
  mode?: 'file' | 'folder'
  fileCount?: number
  idmlSummary?: IdmlSummary | null
  csvSummary?: CsvSummary | null
}

const CSV_EXCEL_RE = /\.(csv|xlsx|xls|tsv)$/i

async function summarizeCsvFile(file: File): Promise<CsvSummary | null> {
  if (!CSV_EXCEL_RE.test(file.name)) return null
  try {
    const sheets = await parseExcelFile(file)
    if (sheets.length === 0) return null
    const first = sheets[0]
    return {
      columns: first.columns.map((c) => c.label),
      rowCount: first.rows.length,
      sheetName: first.name,
    }
  } catch {
    return null
  }
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
  const fileInputId = useId()
  const folderInputId = useId()
  const [dragOver, setDragOver] = useState(false)
  const isFolder = config.mode === 'folder'

  useEffect(() => {
    if (!config.fileKey) {
      setExists(null)
      return
    }
    const check = isFolder
      ? getFiles(config.fileKey).then((arr) => !!arr && arr.length > 0)
      : getFile(config.fileKey).then((f) => !!f)
    check.then(setExists).catch(() => setExists(false))
  }, [config.fileKey, isFolder])

  const onPick = async (f: File) => {
    const key = `wf_file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await putFile(key, f)
    if (config.fileKey) await deleteFile(config.fileKey).catch(() => {})
    // État initial sans summary (visible immédiatement)
    onChange({ fileKey: key, fileName: f.name, fileSize: f.size, mode: 'file', csvSummary: null })

    // Si CSV/Excel, parser pour exposer les colonnes (fond)
    if (CSV_EXCEL_RE.test(f.name)) {
      setAnalyzing(true)
      try {
        const summary = await summarizeCsvFile(f)
        onChange({
          fileKey: key,
          fileName: f.name,
          fileSize: f.size,
          mode: 'file',
          csvSummary: summary,
        })
      } catch (err) {
        console.warn('[Upload] Analyse CSV échouée', err)
      } finally {
        setAnalyzing(false)
      }
    }
  }

  const [analyzing, setAnalyzing] = useState(false)

  const onPickFolder = async (files: File[]) => {
    if (!files.length) return
    const totalSize = files.reduce((s, f) => s + f.size, 0)
    const first = files[0] as File & { webkitRelativePath?: string; _path?: string }
    const folderName = (first._path || first.webkitRelativePath || '').split('/')[0] || 'Dossier'
    const key = `wf_folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await putFiles(key, files)
    if (config.fileKey) await deleteFile(config.fileKey).catch(() => {})

    // Affichage immédiat — l'analyse IDML peut prendre 1-2s sur gros assembly
    onChange({
      fileKey: key,
      fileName: folderName,
      fileSize: totalSize,
      mode: 'folder',
      fileCount: files.length,
      idmlSummary: null,
    })

    setAnalyzing(true)
    try {
      const summary = await summarizeAssembly(files)
      onChange({
        fileKey: key,
        fileName: folderName,
        fileSize: totalSize,
        mode: 'folder',
        fileCount: files.length,
        idmlSummary: summary,
      })
    } catch (err) {
      console.warn('[Upload] Analyse IDML échouée', err)
    } finally {
      setAnalyzing(false)
    }
  }

  const onClear = async () => {
    if (config.fileKey) await deleteFile(config.fileKey).catch(() => {})
    onChange({ fileKey: '', fileName: '', fileSize: 0, mode: config.mode ?? 'file' })
  }

  const Icon = isFolder ? FolderOpen : (config.fileName ? fileExtIcon(config.fileName) : FileIcon)
  const hasFile = !!config.fileName
  const ok = hasFile && exists === true
  const missing = hasFile && exists === false

  return (
    <div className="space-y-2">
      {/* Input fichier (caché, déclenché via <label htmlFor>) */}
      <input
        id={fileInputId}
        type="file"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) await onPick(f)
          e.target.value = ''
        }}
      />
      {/* Input dossier (caché, déclenché via <label htmlFor>) */}
      <input
        id={folderInputId}
        type="file"
        className="sr-only"
        {...({ webkitdirectory: 'true', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={async (e) => {
          const list = Array.from(e.target.files ?? [])
          if (list.length) await onPickFolder(list)
          e.target.value = ''
        }}
      />

      {!hasFile ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault()
              setDragOver(false)
              const items = e.dataTransfer.items
              if (dataTransferHasDirectory(items)) {
                const files = await traverseDataTransfer(items)
                if (files.length) await onPickFolder(files)
              } else {
                const f = e.dataTransfer.files?.[0]
                if (f) await onPick(f)
              }
            }}
            className={`w-full flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-md border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                : 'border-neutral-700 bg-[#0f0f0f] text-neutral-400'
            }`}
          >
            <Upload className="w-5 h-5" />
            <span className="text-[11px]">Déposer ici un fichier ou un dossier</span>
          </div>
          <div className="flex gap-1.5">
            <label
              htmlFor={fileInputId}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md border border-neutral-700 bg-[#0f0f0f] text-neutral-300 hover:border-neutral-600 hover:bg-[#161616] transition-colors cursor-pointer select-none"
            >
              <FileIcon className="w-3 h-3" /> Choisir un fichier
            </label>
            <label
              htmlFor={folderInputId}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-1.5 rounded-md border border-neutral-700 bg-[#0f0f0f] text-neutral-300 hover:border-neutral-600 hover:bg-[#161616] transition-colors cursor-pointer select-none"
            >
              <FolderOpen className="w-3 h-3" /> Choisir un dossier
            </label>
          </div>
        </>
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
              <span>
                {isFolder && config.fileCount ? `${config.fileCount} fichiers · ` : ''}
                {formatBytes(config.fileSize)}
              </span>
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

      {/* Panel résumé IDML — affiché quand un assembly est détecté dans le dossier */}
      {hasFile && isFolder && analyzing && (
        <div className="flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-neutral-800 bg-[#0f0f0f]">
          <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          <span className="text-[11px] text-neutral-400">Analyse de l'assembly…</span>
        </div>
      )}
      {hasFile && isFolder && !analyzing && config.idmlSummary && (
        <IdmlSummaryPanel summary={config.idmlSummary} />
      )}

      {/* Panel résumé CSV/Excel — affiché quand un tableur est détecté */}
      {hasFile && !isFolder && analyzing && (
        <div className="flex items-center justify-center gap-2 px-3 py-3 rounded-md border border-neutral-800 bg-[#0f0f0f]">
          <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          <span className="text-[11px] text-neutral-400">Analyse du tableur…</span>
        </div>
      )}
      {hasFile && !isFolder && !analyzing && config.csvSummary && (
        <CsvSummaryPanel summary={config.csvSummary} />
      )}

      {hasFile ? (
        <div className="flex gap-1.5">
          <label
            htmlFor={fileInputId}
            className="flex-1 text-center text-[11px] text-neutral-400 hover:text-white py-1 rounded hover:bg-white/5 transition-colors cursor-pointer select-none"
          >
            Remplacer par un fichier
          </label>
          <label
            htmlFor={folderInputId}
            className="flex-1 text-center text-[11px] text-neutral-400 hover:text-white py-1 rounded hover:bg-white/5 transition-colors cursor-pointer select-none"
          >
            Remplacer par un dossier
          </label>
        </div>
      ) : null}
    </div>
  )
}

function IdmlSummaryPanel({ summary }: { summary: IdmlSummary }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Fichier IDML', value: summary.idmlFileName },
    { label: 'PDF référence', value: summary.pdfFileName ?? '—' },
    { label: 'Fonts chargées', value: `${summary.fontLoaded} / ${summary.fontTotal}` },
    { label: 'Images', value: String(summary.imageCount) },
    { label: 'Spreads', value: String(summary.spreadCount) },
    { label: 'Fichiers XML', value: String(summary.xmlFileCount) },
  ]
  const uniqueFamilies = Array.from(new Set(summary.fontFamilies))

  return (
    <div className="border border-neutral-800 rounded-md bg-[#0f0f0f] p-3 flex flex-col gap-2.5">
      <p className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider">Résumé</p>
      <div className="grid grid-cols-2 gap-2.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[9px] text-neutral-600 uppercase tracking-wider">{label}</span>
            <span className="text-[11px] text-neutral-200 truncate" title={value}>{value}</span>
          </div>
        ))}
      </div>
      {uniqueFamilies.length > 0 && (
        <div>
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider mb-1">Fonts disponibles</p>
          <div className="flex flex-wrap gap-1">
            {uniqueFamilies.map((family) => (
              <span
                key={family}
                className="text-[10px] bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-neutral-300"
              >
                {family}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CsvSummaryPanel({ summary }: { summary: CsvSummary }) {
  const focusColumn = usePreviewFocus((s) => s.focus)
  const focusedColumn = usePreviewFocus((s) => s.columnLabel)
  return (
    <div className="border border-neutral-800 rounded-md bg-[#0f0f0f] p-3 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[9px] font-semibold text-neutral-500 uppercase tracking-wider">
          Tableur — {summary.sheetName}
        </p>
        <span className="text-[10px] text-neutral-500">
          {summary.rowCount} ligne{summary.rowCount > 1 ? 's' : ''}
        </span>
      </div>
      {summary.columns.length > 0 && (
        <div>
          <p className="text-[9px] text-neutral-600 uppercase tracking-wider mb-1">
            Colonnes — clique pour cibler dans l’aperçu, utilise{' '}
            <code className="text-emerald-300/80">{`{{Nom colonne}}`}</code> dans les nodes en aval
          </p>
          <div className="flex flex-wrap gap-1">
            {summary.columns.map((col) => {
              const active = focusedColumn === col
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => focusColumn(col)}
                  className={`text-[10px] rounded px-1.5 py-0.5 font-mono transition-colors ${
                    active
                      ? 'bg-emerald-400/25 border border-emerald-400/60 text-emerald-100 shadow-[0_0_0_1px_rgba(74,222,128,0.35)]'
                      : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 hover:border-emerald-400/50'
                  }`}
                  title={`Cibler la colonne dans l’aperçu — variable {{${col}}}`}
                >
                  {col}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export const uploadNode: NodeSpec<
  UploadConfig,
  Record<string, never>,
  { file?: File; files?: File[]; rows?: unknown[]; sheet?: unknown }
> = {
  type: 'upload',
  category: 'import',
  label: 'Upload',
  description:
    'Sélectionne un fichier ou un dossier local. Les CSV/Excel sont auto-parsés : leurs colonnes deviennent des variables {{...}} et les rows sortent sur le port `rows`.',
  icon: Upload,
  inputs: [],
  outputs: [
    { name: 'file', type: 'file' },
    { name: 'files', type: 'files' },
    { name: 'rows', type: 'any' },
    { name: 'sheet', type: 'sheet' },
  ],
  configSchema: [],
  defaultConfig: { fileKey: '', fileName: '', fileSize: 0, mode: 'file' },
  runtime: 'client',
  ConfigComponent: UploadConfigUi,
  run: async (ctx, config) => {
    if (!config.fileKey) {
      throw new Error('Aucun fichier sélectionné — ouvrez la config du node Upload pour en choisir un.')
    }
    const isFolder = config.mode === 'folder'
    if (isFolder) {
      const files = await getFiles(config.fileKey)
      if (!files || files.length === 0) {
        throw new Error(
          `Dossier "${config.fileName}" introuvable en stockage local — il a été supprimé ou cet ordinateur ne le contient pas. Re-sélectionnez-le.`,
        )
      }
      const totalKb = files.reduce((s, f) => s + f.size, 0) / 1024
      ctx.log('info', `Dossier prêt : ${config.fileName} (${files.length} fichiers, ${totalKb.toFixed(1)} KB)`)
      return { files }
    }
    const f = await getFile(config.fileKey)
    if (!f) {
      throw new Error(
        `Fichier "${config.fileName}" introuvable en stockage local — il a été supprimé ou cet ordinateur ne le contient pas. Re-sélectionnez-le.`,
      )
    }
    ctx.log('info', `Fichier prêt : ${f.name} (${(f.size / 1024).toFixed(1)} KB)`)

    // Auto-parse CSV/Excel : émettre rows + sheet en plus du file pour permettre
    // un câblage direct Upload → Loop each (sans Parser intermédiaire).
    if (CSV_EXCEL_RE.test(f.name)) {
      try {
        const sheets = await parseExcelFile(f)
        if (sheets.length > 0) {
          const first = sheets[0]
          ctx.log(
            'info',
            `CSV/Excel parsé : ${first.rows.length} lignes, ${first.columns.length} colonnes (${first.columns.map((c) => c.label).join(', ')}).`,
          )
          return { file: f, rows: first.rows, sheet: first }
        }
      } catch (err) {
        ctx.log('warn', `Parse CSV/Excel échoué : ${err instanceof Error ? err.message : err}`)
      }
    }
    return { file: f }
  },
}

nodeRegistry.register(importCsvNode)
nodeRegistry.register(importIdmlNode)
nodeRegistry.register(importSvgNode)
nodeRegistry.register(uploadNode)
