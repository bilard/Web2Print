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
import { httpsCallable } from 'firebase/functions'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useGDriveStore } from '@/stores/gdrive.store'
import { functions } from '@/lib/firebase/config'
import {
  GoogleAuthMissingError,
  downloadDriveFile,
  ensureDriveFolder,
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
// UI commune : sélection d'un item Drive (fichier OU dossier)
// ---------------------------------------------------------------------------

interface PickedFileFields {
  fileId: string
  fileName: string
  fileMimeType: string
}

interface DrivePickerSelection {
  id: string
  name: string
  mimeType: string
}

interface DrivePickerUiProps {
  value: DrivePickerSelection
  onChange: (next: DrivePickerSelection) => void
  /** 'file' = fichier (défaut), 'folder' = dossier uniquement. */
  mode: 'file' | 'folder'
  /** Filtre fichier (ignoré en mode 'folder'). */
  mimeFilter?: 'sheets' | 'all'
  /** Texte du gros bouton dashed quand rien n'est sélectionné. */
  emptyLabel: string
}

/**
 * Picker unifié utilisé par TOUS les nodes Drive (import fichier, import sheet,
 * export sheet → choix dossier, export drive → choix dossier). Même look-and-feel
 * partout : gros bouton dashed quand vide → carte avec icône, statut, ID quand
 * sélectionné → bouton "Changer" en dessous.
 */
function DrivePickerUi({ value, onChange, mode, mimeFilter = 'all', emptyLabel }: DrivePickerUiProps) {
  const [open, setOpen] = useState(false)
  const accessToken = useGDriveStore((s) => s.accessToken)
  const hasItem = !!value.id
  const isFolder = mode === 'folder'

  return (
    <>
      <div className="space-y-2">
        {!hasItem ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md border-2 border-dashed border-neutral-700 bg-[#0f0f0f] text-neutral-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
          >
            {isFolder ? <Folder className="w-4 h-4" /> : <FolderSearch className="w-4 h-4" />}
            <span className="text-[12px]">{emptyLabel}</span>
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
              {value.mimeType === FOLDER_MIME || isFolder ? (
                <Folder className="w-5 h-5" />
              ) : value.mimeType === SHEETS_MIME ? (
                <FileSpreadsheet className="w-5 h-5" />
              ) : (
                <FileBox className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-white truncate" title={value.name}>
                {value.name}
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
                <span className="text-neutral-500 truncate">ID: {value.id.slice(0, 16)}…</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange({ id: '', name: '', mimeType: '' })}
              className="shrink-0 p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-white/5"
              aria-label={isFolder ? 'Réinitialiser à la racine' : 'Retirer la sélection'}
              title={isFolder ? 'Racine "My Drive"' : 'Retirer la sélection'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {hasItem ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-[11px] text-neutral-400 hover:text-white py-1 rounded hover:bg-white/5 transition-colors"
          >
            {isFolder ? 'Changer de dossier' : 'Changer de fichier'}
          </button>
        ) : null}
      </div>

      <GDrivePickerModal
        open={open}
        onClose={() => setOpen(false)}
        onPick={(picked) => {
          if (isFolder && picked.mimeType !== FOLDER_MIME) return
          onChange({ id: picked.id, name: picked.name, mimeType: picked.mimeType })
        }}
        mimeFilter={mimeFilter}
        foldersOnly={isFolder}
        title={isFolder ? 'Choisir un dossier' : undefined}
      />
    </>
  )
}

// Adaptateurs pour les deux schémas de config historiques.

function FilePickerForConfig<C extends PickedFileFields>({
  config,
  onChange,
  mimeFilter,
  emptyLabel,
}: {
  config: C
  onChange: (next: C) => void
  mimeFilter: 'sheets' | 'all'
  emptyLabel: string
}) {
  return (
    <DrivePickerUi
      mode="file"
      mimeFilter={mimeFilter}
      emptyLabel={emptyLabel}
      value={{ id: config.fileId, name: config.fileName, mimeType: config.fileMimeType }}
      onChange={(v) => onChange({ ...config, fileId: v.id, fileName: v.name, fileMimeType: v.mimeType })}
    />
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
      <FilePickerForConfig
        config={config}
        onChange={onChange}
        mimeFilter="sheets"
        emptyLabel="Choisir un Google Sheets"
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

interface FolderTargetFields {
  parentFolderId: string
  parentFolderName: string
}

/**
 * Adaptateur autour de `DrivePickerUi` pour les configs d'export qui stockent
 * la sélection sous `parentFolderId` / `parentFolderName`. Quand vide → racine.
 */
function FolderPickerForExport<C extends FolderTargetFields>({
  config,
  onChange,
}: {
  config: C
  onChange: (next: C) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wider text-neutral-500 block">
        Dossier Drive cible
      </label>
      <DrivePickerUi
        mode="folder"
        emptyLabel='Racine "My Drive" — choisir un dossier'
        value={{
          id: config.parentFolderId,
          name: config.parentFolderName,
          mimeType: config.parentFolderId ? FOLDER_MIME : '',
        }}
        onChange={(v) => onChange({ ...config, parentFolderId: v.id, parentFolderName: v.name })}
      />
    </div>
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
      <FolderPickerForExport config={config} onChange={onChange} />
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
    <FilePickerForConfig
      config={config}
      onChange={onChange}
      mimeFilter="all"
      emptyLabel="Choisir un fichier Drive"
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
      <FolderPickerForExport config={config} onChange={onChange} />
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

// ---------------------------------------------------------------------------
// Save DAM — upload des assets reçus vers un dossier Google Drive
// ---------------------------------------------------------------------------

interface SaveDamConfig {
  // Nom du dossier Drive cible (créé par l'app si absent). PAS un dossier pické : drive.file
  // n'autorise l'écriture que dans les dossiers créés par l'app.
  folderName: string
}

interface DamAsset {
  url?: string
  src?: string
  name?: string
  type?: string
  mimeType?: string
  [key: string]: unknown
}

// Déduit un nom de fichier depuis l'URL (dernier segment) ; fallback indexé.
function assetFileName(asset: DamAsset, index: number): string {
  if (asset.name) return asset.name
  const url = asset.url ?? asset.src
  if (url) {
    try {
      const last = new URL(url).pathname.split('/').filter(Boolean).pop()
      if (last) return decodeURIComponent(last)
    } catch {
      /* URL invalide → fallback */
    }
  }
  return `asset-${index + 1}`
}

// Proxy serveur (Cloud Function) : fetch côté serveur avec UA navigateur → contourne CORS ET le
// blocage anti-bot par User-Agent (les CDN retail type Makita refusent les proxies publics). Cap 4 Mo.
const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(
  functions,
  'imageProxy',
)

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Récupère un asset binaire. Les CDN retail bloquent CORS + proxies publics (UA non-navigateur),
 * donc on passe par la Cloud Function `imageProxy` (fetch serveur, UA navigateur) en PRIORITÉ —
 * ce qui évite aussi les erreurs CORS bruyantes en console. Fallback : fetch direct (CDN
 * CORS-friendly, ou si la function rejette : > 4 Mo, type non géré).
 */
async function fetchAssetBlob(url: string, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) throw new Error('annulé')
  try {
    const { data } = await imageProxyFn({ url })
    return base64ToBlob(data.data, data.mimeType)
  } catch (proxyErr) {
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      if (blob.size === 0) throw new Error('réponse vide')
      return blob
    } catch (directErr) {
      if (signal.aborted) throw directErr
      // L'erreur de la function est généralement la plus parlante (source 4xx, trop lourde…).
      throw proxyErr instanceof Error ? proxyErr : directErr
    }
  }
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
}
function mimeFromName(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext ? EXT_MIME[ext] : undefined
}

function SaveDamConfigUi({
  config,
  onChange,
}: {
  config: SaveDamConfig
  onChange: (next: SaveDamConfig) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wider text-neutral-500 block">
        Dossier Drive (créé s'il n'existe pas)
      </label>
      <input
        type="text"
        value={config.folderName}
        onChange={(e) => onChange({ ...config, folderName: e.target.value })}
        placeholder="Web2Print DAM"
        className="w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
      />
      <p className="text-[10px] text-neutral-600 leading-snug">
        L'app crée/réutilise un dossier de ce nom dans ton Drive. Pas de sélection d'un dossier
        existant : le scope minimal (drive.file) n'autorise l'écriture que dans les dossiers créés
        par l'app.
      </p>
    </div>
  )
}

export const saveDamNode: NodeSpec<SaveDamConfig, { assets: DamAsset[] }, { assets: DamAsset[] }> = {
  type: 'save-dam',
  category: 'persistence',
  label: 'Save DAM',
  description: 'Upload les assets (images, PDF…) reçus dans un dossier Google Drive.',
  icon: FolderUp,
  inputs: [{ name: 'assets', type: 'asset[]', required: true }],
  outputs: [{ name: 'assets', type: 'asset[]' }],
  configSchema: [],
  defaultConfig: { folderName: 'Web2Print DAM' },
  runtime: 'client',
  ConfigComponent: SaveDamConfigUi,
  run: async (ctx, config, inputs) => {
    const assets = inputs.assets ?? []
    if (assets.length === 0) {
      ctx.log('warn', 'Aucun asset en entrée — rien à uploader.')
      return { assets }
    }
    const token = requireToken()
    const folderName = config.folderName?.trim() || 'Web2Print DAM'
    ctx.log('info', `Dossier Drive cible : « ${folderName} » (créé si absent)…`)
    const parentFolderId = await ensureDriveFolder(token, folderName)
    ctx.log('info', `Upload de ${assets.length} asset(s)…`)

    const out: DamAsset[] = []
    let ok = 0
    let failed = 0
    for (let i = 0; i < assets.length; i++) {
      if (ctx.signal.aborted) {
        ctx.log('warn', `Interrompu après ${ok} upload(s).`)
        out.push(...assets.slice(i)) // garde les restants tels quels
        break
      }
      const asset = assets[i]
      const url = asset.url ?? asset.src
      if (!url) {
        ctx.log('warn', `Asset ${i + 1} sans URL — ignoré.`)
        out.push(asset)
        failed++
        continue
      }
      const name = assetFileName(asset, i)
      try {
        const blob = await fetchAssetBlob(url, ctx.signal)
        const file = new File([blob], name, {
          type: blob.type || mimeFromName(name) || asset.mimeType || 'application/octet-stream',
        })
        const meta = await uploadFileToDrive(token, file, { name, parentFolderId })
        out.push({ ...asset, driveId: meta.id, driveLink: meta.webViewLink })
        ok++
        ctx.setProgress?.(Math.round(((i + 1) / assets.length) * 100))
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err)
        // Erreur d'auth Drive → inutile de réessayer pour chaque asset : on échoue net.
        if (/permission refusée|HTTP 40[13]/i.test(m)) {
          throw new Error(
            `Drive : ${m} — reconnecte-toi au panneau Google Drive (scope d'écriture drive.file requis).`,
          )
        }
        failed++
        ctx.log('warn', `Asset ${i + 1} « ${name} » échoué : ${m} (proxy serveur + fetch direct épuisés).`)
        out.push(asset)
      }
    }
    ctx.log(failed > 0 ? 'warn' : 'info', `Terminé : ${ok} uploadé(s), ${failed} échoué(s).`)
    return { assets: out }
  },
}

nodeRegistry.register(gsheetsImportNode)
nodeRegistry.register(gdriveImportNode)
nodeRegistry.register(gsheetsExportNode)
nodeRegistry.register(gdriveExportNode)
nodeRegistry.register(saveDamNode)
