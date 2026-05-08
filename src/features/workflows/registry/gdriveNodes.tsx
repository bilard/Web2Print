// src/features/workflows/registry/gdriveNodes.tsx
import { useState } from 'react'
import {
  Sheet,
  FileBox,
  FileSpreadsheet,
  FolderUp,
  CheckCircle2,
  AlertTriangle,
  Folder,
  FolderSearch,
  X,
} from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useGDriveStore } from '@/stores/gdrive.store'
import {
  GoogleAuthMissingError,
  downloadDriveFile,
  exportSheetToGoogleSheets,
  importGoogleSheetById,
  uploadFileToDrive,
  type DriveFileMeta,
} from '@/features/gdrive/gdriveCore'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import type { ExcelSheet } from '@/features/excel/types'

function requireToken(): string {
  const token = useGDriveStore.getState().accessToken
  if (!token) throw new GoogleAuthMissingError()
  return token
}

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

// ---------------------------------------------------------------------------
// UI commune : sélection d'un fichier via le picker Drive
// ---------------------------------------------------------------------------

interface PickedFileFields {
  fileId: string
  fileName: string
  fileMimeType: string
}

interface FilePickerUiProps<C extends PickedFileFields> {
  config: C
  onChange: (next: C) => void
  mimeFilter: 'sheets' | 'all'
  buttonLabel: string
}

function FilePickerUi<C extends PickedFileFields>({
  config,
  onChange,
  mimeFilter,
  buttonLabel,
}: FilePickerUiProps<C>) {
  const [open, setOpen] = useState(false)
  const accessToken = useGDriveStore((s) => s.accessToken)
  const hasFile = !!config.fileId

  const onClear = () => {
    onChange({ ...config, fileId: '', fileName: '', fileMimeType: '' })
  }

  return (
    <>
      <div className="space-y-2">
        {!hasFile ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md border-2 border-dashed border-neutral-700 bg-[#0f0f0f] text-neutral-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
          >
            <FolderSearch className="w-4 h-4" />
            <span className="text-[12px]">{buttonLabel}</span>
          </button>
        ) : (
          <div className="relative flex items-center gap-2 p-2 rounded-md border border-neutral-700 bg-[#161616]">
            <div
              className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center border ${
                accessToken
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {config.fileMimeType === SHEETS_MIME ? (
                <FileSpreadsheet className="w-5 h-5" />
              ) : config.fileMimeType === FOLDER_MIME ? (
                <Folder className="w-5 h-5" />
              ) : (
                <FileBox className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-white truncate" title={config.fileName}>
                {config.fileName}
              </div>
              <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                {accessToken ? (
                  <span className="flex items-center gap-0.5 text-emerald-400">
                    <CheckCircle2 className="w-2.5 h-2.5" /> prêt
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <AlertTriangle className="w-2.5 h-2.5" /> non connecté
                  </span>
                )}
                <span className="text-neutral-500 truncate">ID: {config.fileId.slice(0, 16)}…</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5"
              aria-label="Retirer la sélection"
              title="Retirer la sélection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {hasFile ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-[11px] text-neutral-400 hover:text-white py-1 rounded hover:bg-white/5 transition-colors"
          >
            Changer de fichier
          </button>
        ) : null}
      </div>

      <GDrivePickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => onChange({ ...config, fileId: picked.id, fileName: picked.name, fileMimeType: picked.mimeType })}
        mimeFilter={mimeFilter}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Import Google Sheets
// ---------------------------------------------------------------------------

interface GSheetsImportConfig extends PickedFileFields {
  sheetIndex: number
}

function GSheetsImportConfigUi({
  config,
  onChange,
}: {
  config: GSheetsImportConfig
  onChange: (next: GSheetsImportConfig) => void
}) {
  return (
    <div className="space-y-3">
      <FilePickerUi
        config={config}
        onChange={onChange}
        mimeFilter="sheets"
        buttonLabel="Choisir un Google Sheets"
      />
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          Index de l'onglet
        </label>
        <input
          type="number"
          min={0}
          value={config.sheetIndex}
          onChange={(e) => onChange({ ...config, sheetIndex: Number(e.target.value) })}
          className="w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        />
        <p className="text-[10px] text-neutral-600 mt-1">0 = premier onglet</p>
      </div>
    </div>
  )
}

export const gsheetsImportNode: NodeSpec<
  GSheetsImportConfig,
  Record<string, never>,
  { sheet: ExcelSheet }
> = {
  type: 'gsheets-import',
  category: 'import',
  label: 'Import Google Sheets',
  description: "Sélectionne un Google Sheets depuis votre Drive et le charge en Sheet.",
  icon: Sheet,
  inputs: [],
  outputs: [{ name: 'sheet', type: 'sheet' }],
  configSchema: [],
  defaultConfig: { fileId: '', fileName: '', fileMimeType: '', sheetIndex: 0 },
  runtime: 'client',
  ConfigComponent: GSheetsImportConfigUi,
  run: async (ctx, config) => {
    const token = requireToken()
    if (!config.fileId) {
      throw new Error('Aucun Google Sheets sélectionné — ouvrez la config du node pour en choisir un.')
    }
    ctx.log('info', `Import GSheet ${config.fileName} (${config.fileId})…`)
    const sheets = await importGoogleSheetById(config.fileId, token)
    const idx = Math.max(0, Math.min(config.sheetIndex ?? 0, sheets.length - 1))
    ctx.log('info', `${sheets.length} onglet(s) lu(s) — sélection #${idx} (${sheets[idx].name})`)
    return { sheet: sheets[idx] }
  },
}

// ---------------------------------------------------------------------------
// Export Google Sheets
// ---------------------------------------------------------------------------

interface GSheetsExportConfig {
  name: string
  /** Dossier parent — sélectionnable via picker (sinon racine). */
  parentFolderId: string
  parentFolderName: string
}

function FolderPickerUi({
  config,
  onChange,
}: {
  config: GSheetsExportConfig
  onChange: (next: GSheetsExportConfig) => void
}) {
  const [open, setOpen] = useState(false)
  const hasFolder = !!config.parentFolderId

  return (
    <>
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 block">
          Dossier Drive cible
        </label>
        {!hasFolder ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-dashed border-neutral-700 bg-[#0f0f0f] text-neutral-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
          >
            <Folder className="w-3.5 h-3.5" />
            <span className="text-[11px]">Racine "My Drive" — cliquer pour choisir un dossier</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded-md border border-neutral-700 bg-[#161616]">
            <Folder className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-[12px] text-white flex-1 truncate" title={config.parentFolderName}>
              {config.parentFolderName}
            </span>
            <button
              type="button"
              onClick={() => onChange({ ...config, parentFolderId: '', parentFolderName: '' })}
              className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5"
              title="Racine"
            >
              <X className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[10px] text-neutral-400 hover:text-white"
            >
              Changer
            </button>
          </div>
        )}
      </div>

      {/* Le picker filtre sur tout, mais seuls les dossiers sont "ouvrables" via
          double-clic. On exploite le clic comme sélection sur n'importe quel
          item — l'utilisateur peut sélectionner le dossier courant en cliquant
          sur un de ses sous-éléments puis remontant : on garde le picker simple
          et on ne sélectionne QUE des dossiers ici. */}
      <GDrivePickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          if (picked.mimeType === FOLDER_MIME) {
            onChange({ ...config, parentFolderId: picked.id, parentFolderName: picked.name })
          }
        }}
        mimeFilter="all"
        title="Choisir un dossier"
      />
    </>
  )
}

function GSheetsExportConfigUi({
  config,
  onChange,
}: {
  config: GSheetsExportConfig
  onChange: (next: GSheetsExportConfig) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          Nom du Google Sheets
        </label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          className="w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="Workflow Export"
        />
      </div>
      <FolderPickerUi config={config} onChange={onChange} />
    </div>
  )
}

export const gsheetsExportNode: NodeSpec<
  GSheetsExportConfig,
  { sheet: ExcelSheet | null },
  { result: DriveFileMeta }
> = {
  type: 'gsheets-export',
  category: 'export',
  label: 'Export Google Sheets',
  description: "Crée un Google Sheets dans Drive depuis une Sheet du workflow.",
  icon: FileSpreadsheet,
  inputs: [{ name: 'sheet', type: 'sheet', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [],
  defaultConfig: { name: 'Workflow Export', parentFolderId: '', parentFolderName: '' },
  runtime: 'client',
  ConfigComponent: GSheetsExportConfigUi,
  run: async (ctx, config, inputs) => {
    const token = requireToken()
    if (!inputs.sheet) {
      throw new Error('Sheet manquante en entrée — branchez un node qui produit une Sheet.')
    }
    const name = config.name?.trim() || 'Workflow Export'
    ctx.log('info', `Création GSheet "${name}" (${inputs.sheet.rows.length} lignes)…`)
    const meta = await exportSheetToGoogleSheets(token, inputs.sheet, {
      name,
      parentFolderId: config.parentFolderId?.trim() || undefined,
    })
    ctx.log('info', `OK — ${meta.webViewLink ?? meta.id}`)
    return { result: meta }
  },
}

// ---------------------------------------------------------------------------
// Import Google Drive
// ---------------------------------------------------------------------------

interface GDriveImportConfig extends PickedFileFields {}

function GDriveImportConfigUi({
  config,
  onChange,
}: {
  config: GDriveImportConfig
  onChange: (next: GDriveImportConfig) => void
}) {
  return (
    <FilePickerUi
      config={config}
      onChange={onChange}
      mimeFilter="all"
      buttonLabel="Choisir un fichier Drive"
    />
  )
}

export const gdriveImportNode: NodeSpec<
  GDriveImportConfig,
  Record<string, never>,
  { file: File }
> = {
  type: 'gdrive-import',
  category: 'import',
  label: 'Import Google Drive',
  description: "Sélectionne un fichier dans Drive et le télécharge sous forme de File.",
  icon: FileBox,
  inputs: [],
  outputs: [{ name: 'file', type: 'file' }],
  configSchema: [],
  defaultConfig: { fileId: '', fileName: '', fileMimeType: '' },
  runtime: 'client',
  ConfigComponent: GDriveImportConfigUi,
  run: async (ctx, config) => {
    const token = requireToken()
    if (!config.fileId) {
      throw new Error('Aucun fichier Drive sélectionné — ouvrez la config du node pour en choisir un.')
    }
    ctx.log('info', `Download Drive ${config.fileName} (${config.fileId})…`)
    const file = await downloadDriveFile(config.fileId, token)
    ctx.log('info', `OK — ${file.name} (${(file.size / 1024).toFixed(1)} KB)`)
    return { file }
  },
}

// ---------------------------------------------------------------------------
// Export Google Drive
// ---------------------------------------------------------------------------

interface GDriveExportConfig {
  name: string
  parentFolderId: string
  parentFolderName: string
}

function GDriveExportConfigUi({
  config,
  onChange,
}: {
  config: GDriveExportConfig
  onChange: (next: GDriveExportConfig) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          Nom du fichier
        </label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          className="w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="(vide = nom d'origine)"
        />
      </div>
      <FolderPickerUi
        // ré-utilise FolderPickerUi : sa signature lit/écrit les mêmes champs
        config={config as unknown as GSheetsExportConfig}
        onChange={(next) => onChange(next as unknown as GDriveExportConfig)}
      />
    </div>
  )
}

export const gdriveExportNode: NodeSpec<
  GDriveExportConfig,
  { file: File | Blob | null },
  { result: DriveFileMeta }
> = {
  type: 'gdrive-export',
  category: 'export',
  label: 'Export Google Drive',
  description: "Upload un fichier (Upload, image générée, export…) sur Google Drive.",
  icon: FolderUp,
  inputs: [{ name: 'file', type: 'file', required: true }],
  outputs: [{ name: 'result', type: 'export-result' }],
  configSchema: [],
  defaultConfig: { name: '', parentFolderId: '', parentFolderName: '' },
  runtime: 'client',
  ConfigComponent: GDriveExportConfigUi,
  run: async (ctx, config, inputs) => {
    const token = requireToken()
    if (!inputs.file) {
      throw new Error('Fichier manquant en entrée — branchez un node qui produit un fichier.')
    }
    const file = inputs.file
    const fallbackName = file instanceof File && file.name ? file.name : `upload_${Date.now()}`
    const name = config.name?.trim() || fallbackName
    ctx.log('info', `Upload Drive "${name}"…`)
    const meta = await uploadFileToDrive(token, file, {
      name,
      parentFolderId: config.parentFolderId?.trim() || undefined,
    })
    ctx.log('info', `OK — ${meta.webViewLink ?? meta.id}`)
    return { result: meta }
  },
}

nodeRegistry.register(gsheetsImportNode)
nodeRegistry.register(gdriveImportNode)
nodeRegistry.register(gsheetsExportNode)
nodeRegistry.register(gdriveExportNode)
