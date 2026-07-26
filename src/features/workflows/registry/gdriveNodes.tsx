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
  FunctionSquare,
  BarChart3,
} from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { useGDriveStore } from '@/stores/gdrive.store'
import { getServerGoogleToken } from '@/features/gdrive/serverGoogleToken'
import { functions, auth } from '@/lib/firebase/config'
import { useAccessStore } from '@/stores/access.store'
import { DEMO_PERMISSION } from '@/features/access/permissions'
import { incrementUsage } from '@/features/access/usage'
import {
  GoogleAuthMissingError,
  downloadDriveFile,
  ensureDriveFolder,
  exportSheetToGoogleSheets,
  updateGoogleSheetById,
  getDriveFileStatus,
  type FormulaColumn,
  type SheetChartOptions,
  importGoogleSheetById,
  uploadFileToDrive,
  type DriveFileMeta,
} from '@/features/gdrive/gdriveCore'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import { GSheetsFormulaModal } from './GSheetsFormulaModal'
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

/**
 * Normalise l'entrée du node Export Google Sheets en une `ExcelSheet`.
 * - une Sheet déjà formée (colonnes + lignes) passe telle quelle ;
 * - une chaîne (sortie d'un node Saisie texte / LLM, port typé `any`) devient
 *   une Sheet à une colonne « Texte » et une ligne ;
 * - tout autre type est une erreur de branchement explicite.
 */
function coerceToExcelSheet(input: unknown, name: string): ExcelSheet {
  if (
    input &&
    typeof input === 'object' &&
    Array.isArray((input as ExcelSheet).rows) &&
    Array.isArray((input as ExcelSheet).columns)
  ) {
    return input as ExcelSheet
  }
  if (typeof input === 'string') {
    const column: ExcelColumn = {
      key: 'texte',
      label: 'Texte',
      fieldType: 'text',
      detectedType: 'text',
      isPrimary: true,
      width: 240,
    }
    const row: ExcelRow = { _id: 'r0', texte: input }
    return { name, columns: [column], rows: [row], taxonomy: [] }
  }
  throw new Error(
    'Export Google Sheets attend une Sheet ou du texte en entrée — branchez un node qui produit une Sheet (ou une Saisie texte).',
  )
}

function requireToken(): string {
  const token = useGDriveStore.getState().accessToken
  if (!token) throw new GoogleAuthMissingError()
  return token
}

/**
 * Jeton Google pour les nodes : on PRÉFÈRE le connecteur serveur (refresh token,
 * rafraîchi tout seul → pas de popup ni d'écran « appli non validée »), et on
 * retombe sur le jeton navigateur si le connecteur serveur n'est pas connecté.
 * Bonus : l'éditeur partage alors l'identité OAuth du cron → cohérence drive.file.
 */
async function getNodeGoogleToken(): Promise<string> {
  try {
    return await getServerGoogleToken()
  } catch {
    return requireToken()
  }
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
            className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-md border-2 border-dashed border-neutral-700 bg-background text-neutral-400 hover:border-blue-500/40 hover:text-blue-300 transition-colors"
          >
            {isFolder ? <Folder className="w-4 h-4" /> : <FolderSearch className="w-4 h-4" />}
            <span className="text-[12px]">{emptyLabel}</span>
          </button>
        ) : (
          <div className="relative flex items-center gap-2 p-2 rounded-md border border-neutral-700 bg-well">
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
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        />
        <p className="text-[10px] text-neutral-600 mt-1">0 = premier onglet</p>
      </div>
    </div>
  )
}

const gsheetsImportNode: NodeSpec<
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
    const token = await getNodeGoogleToken()
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
  /** Dossier de destination par NOM : créé/réutilisé par l'app (garanti sous drive.file). Vide = racine. */
  folderName: string
  /** Dossier parent pické (legacy) — sinon racine. Conservé pour compat. */
  parentFolderId: string
  parentFolderName: string
  /** 'create' = nouveau fichier à chaque run ; 'update' = réécrit un fichier existant. */
  mode: 'create' | 'update'
  /** URL ou ID du Google Sheet à mettre à jour (mode 'update'). */
  spreadsheetId: string
  /** Colonnes-formule Google Sheets vivantes : une par ligne, `En-tête = formule {col}`. */
  formulaColumns: string
  /** Graphe natif inséré dans le Sheet (optionnel). */
  chartEnabled?: boolean
  chartType?: string
  chartXColumn?: string
  /** Colonnes de valeurs (clés/libellés séparés par des virgules). */
  chartValueColumns?: string
}

/** Parse les colonnes-formule : `En-tête = template` (template peut référencer {colonne}). */
function parseFormulaColumns(raw: string): FormulaColumn[] {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line): FormulaColumn | null => {
      const eq = line.indexOf('=')
      if (eq < 0) return null
      const template = line.slice(eq + 1).trim()
      const left = line.slice(0, eq)
      const fm = left.match(/^(.*?)\s*\[([a-z_]+)\]\s*$/) // En-tête [format]
      const header = (fm ? fm[1] : left).trim()
      const format = fm ? fm[2] : undefined
      return header && template ? { header, template, format } : null
    })
    .filter((f): f is FormulaColumn => f !== null)
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
  availableColumns = [],
}: {
  config: GSheetsExportConfig
  onChange: (next: GSheetsExportConfig) => void
  availableColumns?: string[]
}) {
  const [formulaModal, setFormulaModal] = useState(false)
  const formulaCount = parseFormulaColumns(config.formulaColumns ?? '').length
  const hasId = !!config.spreadsheetId?.trim()
  // « Mettre à jour » n'a de sens qu'avec un fichier cible : sans URL/ID, l'option
  // est grisée et l'affichage retombe sur « Créer » (le run crée de toute façon).
  const mode = (config.mode ?? 'create') === 'update' && hasId ? 'update' : 'create'
  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          À chaque exécution
        </label>
        <select
          value={mode}
          onChange={(e) => onChange({ ...config, mode: e.target.value as 'create' | 'update' })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
        >
          <option value="create">Créer un nouveau fichier</option>
          <option value="update" disabled={!hasId}>
            Mettre à jour le même fichier{!hasId ? ' — renseignez l’URL ci-dessous' : ''}
          </option>
        </select>
      </div>

      {/* URL/ID toujours visible : c'est lui qui débloque le mode « Mettre à jour ». */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          URL ou ID du Google Sheet à réutiliser (optionnel)
        </label>
        <input
          type="text"
          value={config.spreadsheetId ?? ''}
          onChange={(e) => onChange({ ...config, spreadsheetId: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="https://docs.google.com/spreadsheets/d/…"
        />
        <p className="text-[10px] text-neutral-600 leading-snug mt-1">
          Collez le lien d'un Google Sheets créé par l'app pour réécrire son contenu à chaque
          exécution. Laissez vide pour créer un nouveau fichier.
        </p>
      </div>

      {/* Nouveau fichier : nom + dossier de destination Drive (bouton « Choisir un dossier »). */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          Nom du Google Sheets
        </label>
        <input
          type="text"
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="Workflow Export"
        />
      </div>
      <FolderPickerForExport config={config} onChange={onChange} />
      <div>
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 block">
          Ou dossier par nom
        </label>
        <input
          type="text"
          value={config.folderName ?? ''}
          onChange={(e) => onChange({ ...config, folderName: e.target.value })}
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="Ex : Web2Print (l'app le crée/réutilise)"
        />
        <p className="text-[10px] text-neutral-600 leading-snug mt-1">
          Prioritaire sur le dossier choisi ci-dessus : l'app crée/réutilise un dossier de ce nom.
          Laisse vide pour utiliser le dossier sélectionné (ou la racine).
        </p>
      </div>
      {mode === 'update' && (
        <p className="text-[10px] text-amber-400/70 leading-snug">
          ↳ Nom et dossier ne servent qu'à la <strong>création</strong> d'un nouveau fichier
          (videz l'URL ci-dessus). Une mise à jour réécrit le fichier existant sans le déplacer.
        </p>
      )}

      <div className="pt-2 border-t border-neutral-800">
        <label className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2 block">
          Colonnes formule (Google Sheets)
        </label>
        <button
          type="button"
          onClick={() => setFormulaModal(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-200 text-sm transition-colors"
        >
          <FunctionSquare className="w-4 h-4" />
          Formules
          {formulaCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/30 text-[10px] tabular-nums">{formulaCount}</span>
          )}
        </button>
        <p className="text-[10px] text-neutral-600 mt-1 leading-snug">
          Colonnes calculées écrites comme formules <strong>vivantes</strong> dans le Google Sheets.
        </p>
      </div>

      <div className="pt-2 border-t border-neutral-800">
        <label className="flex items-center gap-2 text-sm text-neutral-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.chartEnabled}
            onChange={(e) => onChange({ ...config, chartEnabled: e.target.checked })}
            className="accent-indigo-500"
          />
          <BarChart3 className="w-4 h-4 text-indigo-300" />
          Insérer un graphique
        </label>
        {config.chartEnabled && (
          <div className="mt-2 space-y-2 pl-1">
            <select
              value={config.chartType ?? 'bar'}
              onChange={(e) => onChange({ ...config, chartType: e.target.value })}
              className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="bar">Barres</option>
              <option value="line">Lignes</option>
              <option value="area">Aire</option>
              <option value="pie">Camembert</option>
              <option value="doughnut">Anneau</option>
            </select>
            <select
              value={config.chartXColumn ?? ''}
              onChange={(e) => onChange({ ...config, chartXColumn: e.target.value })}
              className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="">— axe X (catégories) —</option>
              {availableColumns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Colonnes de valeurs</p>
              {availableColumns.length === 0 ? (
                <p className="text-[10px] text-neutral-600 italic">Lance le node amont pour voir les colonnes.</p>
              ) : (
                <div className="max-h-32 overflow-auto rounded border border-neutral-800 bg-background divide-y divide-neutral-900">
                  {availableColumns.map((c) => {
                    const sel = String(config.chartValueColumns ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                    return (
                      <label key={c} className="flex items-center gap-2 px-2 py-1 text-sm text-neutral-300 cursor-pointer hover:bg-white/[0.03]">
                        <input
                          type="checkbox"
                          checked={sel.includes(c)}
                          onChange={() => {
                            const set = new Set(sel)
                            if (set.has(c)) set.delete(c)
                            else set.add(c)
                            onChange({ ...config, chartValueColumns: Array.from(set).join(', ') })
                          }}
                          className="accent-indigo-500"
                        />
                        <span className="truncate">{c}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {formulaModal && (
        <GSheetsFormulaModal
          value={config.formulaColumns ?? ''}
          onChange={(v) => onChange({ ...config, formulaColumns: v })}
          columns={availableColumns}
          onClose={() => setFormulaModal(false)}
        />
      )}
    </div>
  )
}

const gsheetsExportNode: NodeSpec<
  GSheetsExportConfig,
  { sheet: unknown },
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
  defaultConfig: { name: 'Workflow Export', folderName: '', parentFolderId: '', parentFolderName: '', mode: 'create', spreadsheetId: '', formulaColumns: '' },
  runtime: 'client',
  ConfigComponent: GSheetsExportConfigUi,
  run: async (ctx, config, inputs) => {
    const token = await getNodeGoogleToken()
    if (inputs.sheet == null) {
      throw new Error('Sheet manquante en entrée — branchez un node qui produit une Sheet (ou une Saisie texte).')
    }
    const name = config.name?.trim() || 'Workflow Export'
    const sheet = coerceToExcelSheet(inputs.sheet, name)
    const formulas = parseFormulaColumns(config.formulaColumns)
    if (sheet.rows.length === 0) {
      if (formulas.length > 0) {
        ctx.log('info', "Aucune donnée amont — 1 ligne d'essai ajoutée pour tester les formules (saisis des valeurs dans le Sheet, elles se recalculent).")
      } else {
        ctx.log('warn', 'Aucune ligne à exporter — le fichier sera vide. Vérifie le node amont (« Comparer les prix »).')
      }
    }
    if (formulas.length > 0) ctx.log('info', `${formulas.length} colonne(s) formule ajoutée(s).`)
    // Graphe natif optionnel (inséré via l'API Sheets après écriture).
    const chart: SheetChartOptions | undefined =
      config.chartEnabled && config.chartXColumn?.trim() && config.chartValueColumns?.trim()
        ? { type: config.chartType || 'bar', xColumn: config.chartXColumn, valueColumns: config.chartValueColumns }
        : undefined
    if (config.chartEnabled && !chart) ctx.log('warn', 'Graphique ignoré : choisis l’axe X et au moins une colonne de valeurs.')
    if (config.mode === 'update' && config.spreadsheetId?.trim()) {
      const fileId = config.spreadsheetId.trim()
      const status = await getDriveFileStatus(token, fileId)
      if (status === 'ok') {
        ctx.log('info', `Mise à jour du Google Sheet existant (${sheet.rows.length} lignes)…`)
        const meta = await updateGoogleSheetById(token, fileId, sheet, formulas, chart)
        ctx.log('info', `OK — ${meta.webViewLink ?? meta.id}`)
        return { result: meta }
      }
      // Fichier dans la corbeille / supprimé → on ne le réécrit pas, on crée un nouveau fichier.
      ctx.log(
        'warn',
        status === 'trashed'
          ? 'Le fichier cible est dans la corbeille → création d’un nouveau fichier à la place.'
          : 'Le fichier cible est introuvable → création d’un nouveau fichier à la place.',
      )
    }
    // Dossier de destination : par NOM (créé/réutilisé par l'app, garanti sous drive.file),
    // sinon dossier pické legacy, sinon racine.
    let parentFolderId = config.parentFolderId?.trim() || undefined
    const folderName = config.folderName?.trim()
    if (folderName) {
      ctx.log('info', `Dossier « ${folderName} » (créé/réutilisé par l'app)…`)
      parentFolderId = await ensureDriveFolder(token, folderName)
    }
    ctx.log('info', `Création GSheet "${name}" (${sheet.rows.length} lignes)…`)
    const meta = await exportSheetToGoogleSheets(token, sheet, { name, parentFolderId, formulas, chart })
    ctx.log('info', `OK — ${meta.webViewLink ?? meta.id}`)
    // Mode « même fichier » : mémoriser l'ID créé → les prochains runs mettront à jour CE fichier
    // (1 seule création, puis des mises à jour ; recrée seulement s'il est supprimé).
    if (config.mode === 'update') {
      ctx.patchConfig?.({ spreadsheetId: meta.id })
      ctx.log('info', 'Fichier mémorisé — les prochains runs mettront à jour ce même fichier.')
    }
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

const gdriveImportNode: NodeSpec<
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
    const token = await getNodeGoogleToken()
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
          className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          placeholder="(vide = nom d'origine)"
        />
      </div>
      <FolderPickerForExport config={config} onChange={onChange} />
    </div>
  )
}

const gdriveExportNode: NodeSpec<
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
    const token = await getNodeGoogleToken()
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
      // eslint-disable-next-line preserve-caught-error -- échec propre du fetch de repli, capté localement (directErr)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      // eslint-disable-next-line preserve-caught-error -- échec propre du fetch de repli, capté localement (directErr)
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
        className="w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
      />
      <p className="text-[10px] text-neutral-600 leading-snug">
        L'app crée/réutilise un dossier de ce nom dans ton Drive. Pas de sélection d'un dossier
        existant : le scope minimal (drive.file) n'autorise l'écriture que dans les dossiers créés
        par l'app.
      </p>
    </div>
  )
}

const saveDamNode: NodeSpec<SaveDamConfig, { assets: DamAsset[] }, { assets: DamAsset[] }> = {
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
    // Quota compte démo : plafonne le nombre d'assets uploadés via le workflow (compteur
    // PARTAGÉ users/{uid}.usage.damAssets, commun au chemin UI). Métrage best-effort :
    // le node écrit dans le Drive PROPRE de l'utilisateur avec SON token → pas de
    // chokepoint serveur possible ici (contrairement au PIM/Firestore).
    const acc = useAccessStore.getState()
    const isDemo = !acc.isOwner && acc.permissions.has(DEMO_PERMISSION)
    const demoUid = auth.currentUser?.uid ?? null
    const damLimit = acc.limits.damAssets
    const maxUploads = isDemo ? Math.max(0, damLimit - acc.usage.damAssets) : Infinity
    if (isDemo && maxUploads <= 0) {
      ctx.log('warn', `Limite démo atteinte (${damLimit} assets DAM) — aucun upload.`)
      return { assets }
    }

    const token = await getNodeGoogleToken()
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
      // Quota démo atteint pour ce run → on laisse passer les assets restants sans uploader.
      if (isDemo && ok >= maxUploads) {
        if (out.length === i) ctx.log('warn', `Limite démo (${damLimit} assets DAM) — ${assets.length - i} asset(s) non uploadé(s).`)
        out.push(asset)
        continue
      }
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
        if (isDemo && demoUid) {
          useAccessStore.getState().bumpUsage({ damAssets: 1 }) // miroir local immédiat
          void incrementUsage(demoUid, { damAssets: 1 }).catch(() => {}) // compteur serveur partagé
        }
        ctx.setProgress?.(Math.round(((i + 1) / assets.length) * 100))
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err)
        // Erreur d'auth Drive → inutile de réessayer pour chaque asset : on échoue net.
        if (/permission refusée|HTTP 40[13]/i.test(m)) {
          throw new Error(
            `Drive : ${m} — reconnecte-toi au panneau Google Drive (scope d'écriture drive.file requis).`,
            { cause: err },
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
