// src/features/dam/LinkDriveImagesModal.tsx
// Lie les images d'un dossier Google Drive aux lignes de la feuille active, par
// correspondance de nom de fichier → écrit le webViewLink Drive dans une colonne
// image (rendue par DamImage). Écriture en un seul setSheets (cf. useDamMigration).
import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Folder, Loader2, CheckCircle2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/shared/CloseButton'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn } from '@/features/excel/types'
import { buildDriveIndex, matchCell, type DriveImageFile, type DriveIndex } from './driveImageMatch'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function uniqueKey(base: string, columns: ExcelColumn[]): string {
  const keys = new Set(columns.map((c) => c.key))
  let k = base
  let n = 1
  while (keys.has(k)) k = `${base}_${n++}`
  return k
}

interface Props { open: boolean; onClose: () => void }

export function LinkDriveImagesModal({ open, onClose }: Props) {
  const { listAllImagesInFolder } = useGoogleDrive()
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex]

  const [folder, setFolder] = useState<{ id: string; name: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [driveFiles, setDriveFiles] = useState<DriveImageFile[]>([])
  const [index, setIndex] = useState<DriveIndex | null>(null)
  const [sourceCol, setSourceCol] = useState('')
  const [target, setTarget] = useState('new')
  const [writing, setWriting] = useState(false)
  const [done, setDone] = useState<{ matched: number; total: number; unused: number } | null>(null)

  const columns = sheet?.columns ?? []
  const rows = sheet?.rows ?? []

  const reset = useCallback(() => {
    setFolder(null); setDriveFiles([]); setIndex(null); setSourceCol(''); setTarget('new'); setDone(null)
  }, [])
  const handleClose = () => { if (writing) return; reset(); onClose() }

  // Nombre de correspondances par colonne (pour auto-détecter la meilleure source).
  const matchCounts = useMemo(() => {
    if (!index) return {} as Record<string, number>
    const out: Record<string, number> = {}
    for (const c of columns) {
      let n = 0
      for (const r of rows) if (matchCell(r[c.key], index)) n++
      out[c.key] = n
    }
    return out
  }, [index, columns, rows])

  const loadFolder = useCallback(async (f: { id: string; name: string }) => {
    setFolder(f); setLoading(true); setDone(null)
    try {
      const files = await listAllImagesInFolder(f.id)
      const mapped: DriveImageFile[] = files.map((x) => ({ id: x.id, name: x.name, webViewLink: x.webViewLink }))
      setDriveFiles(mapped)
      const idx = buildDriveIndex(mapped)
      setIndex(idx)
      // Auto-sélectionne la colonne avec le plus de correspondances.
      let best = '', bestN = -1
      for (const c of (sheet?.columns ?? [])) {
        let n = 0
        for (const r of (sheet?.rows ?? [])) if (matchCell(r[c.key], idx)) n++
        if (n > bestN) { bestN = n; best = c.key }
      }
      setSourceCol(best)
      if (!files.length) toast.warning('Aucune image dans ce dossier Drive')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lecture du dossier échouée')
    } finally {
      setLoading(false)
    }
  }, [listAllImagesInFolder, sheet])

  const matched = sourceCol ? (matchCounts[sourceCol] ?? 0) : 0

  const apply = () => {
    if (!sheet || !index || !sourceCol) return
    setWriting(true)
    try {
      const st = useExcelStore.getState()
      const cur = st.sheets
      const curSheet = cur[activeSheetIndex]
      const targetKey = target === 'new' ? uniqueKey('dam_image', curSheet.columns) : target
      const newCol: ExcelColumn = {
        key: targetKey, label: 'Image (DAM)', fieldType: 'image', detectedType: 'image', isPrimary: false, width: 280,
      }
      const nextColumns = target === 'new'
        ? [...curSheet.columns, newCol]
        : curSheet.columns.map((c) => (c.key === targetKey ? { ...c, fieldType: 'image' as const } : c))
      const used = new Set<string>()
      let m = 0
      const nextRows = curSheet.rows.map((r) => {
        const hit = matchCell(r[sourceCol], index)
        if (!hit) return r
        m++; used.add(hit.id)
        return { ...r, [targetKey]: hit.webViewLink }
      })
      st.setSheets(cur.map((s, i) => (i === activeSheetIndex ? { ...curSheet, columns: nextColumns, rows: nextRows } : s)))
      setDone({ matched: m, total: curSheet.rows.length, unused: driveFiles.length - used.size })
      toast.success(`${m} image(s) liée(s) sur ${curSheet.rows.length} ligne(s)`)
    } finally {
      setWriting(false)
    }
  }

  if (!open) return null
  if (!sheet) return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="w-[560px] max-w-[95vw] bg-background border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center"><Link2 className="w-5 h-5 text-indigo-400" /></div>
            <div>
              <p className="text-sm font-medium text-white">Lier les images Drive au PIM</p>
              <p className="text-[11px] text-white/40">Correspondance par nom de fichier · {rows.length} ligne(s)</p>
            </div>
          </div>
          <CloseButton onClick={handleClose} title="Fermer" />
        </header>

        <div className="p-5 flex flex-col gap-4">
          {/* 1. Dossier Drive */}
          <button type="button" onClick={() => setPickerOpen(true)} disabled={writing}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-surface-2 transition-colors text-left disabled:opacity-50">
            <Folder className="w-5 h-5 text-amber-300 shrink-0" fill="currentColor" fillOpacity={0.3} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{folder ? folder.name : 'Choisir le dossier Drive des images'}</p>
              <p className="text-[11px] text-white/40">{loading ? 'Lecture du dossier…' : folder ? `${driveFiles.length} image(s) trouvée(s)` : 'Parcourez votre Google Drive'}</p>
            </div>
            {loading && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
          </button>

          {/* 2. Colonnes + aperçu (après chargement) */}
          {index && !loading && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-white/50">Colonne contenant le nom de fichier</label>
                <select value={sourceCol} onChange={(e) => setSourceCol(e.target.value)} disabled={writing}
                  className="bg-well border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40">
                  {columns.map((c) => (
                    <option key={c.key} value={c.key}>{c.label} — {matchCounts[c.key] ?? 0} corresp.</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-white/50">Colonne image de destination</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={writing}
                  className="bg-well border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/40">
                  <option value="new">➕ Nouvelle colonne « Image (DAM) »</option>
                  {columns.map((c) => (<option key={c.key} value={c.key}>Écraser : {c.label}</option>))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-[12px] rounded-lg bg-well px-3 py-2.5">
                <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-white/70">
                  <b className={matched === rows.length ? 'text-emerald-400' : 'text-amber-400'}>{matched}/{rows.length}</b> ligne(s) correspondent
                  {driveFiles.length - matched > 0 && <span className="text-white/40"> · {driveFiles.length} images Drive</span>}
                </span>
              </div>
            </>
          )}

          {done && (
            <div className="flex items-center gap-2 text-[12px] text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />{done.matched} liée(s){done.unused > 0 ? ` · ${done.unused} image(s) Drive non utilisée(s)` : ''} — pensez à Sauver
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">{done ? 'Fermer' : 'Annuler'}</button>
          <button onClick={apply} disabled={writing || !index || !sourceCol || matched === 0 || !!done}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-white/[0.06] disabled:text-white/30 text-[#fff] text-sm font-medium transition-colors">
            {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {writing ? 'Liaison…' : done ? 'Lié' : `Lier${matched ? ` ${matched}` : ''}`}
          </button>
        </footer>
      </div>

      <GDrivePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => { if (p.mimeType === FOLDER_MIME) void loadFolder({ id: p.id, name: p.name }) }}
        foldersOnly
        title="Dossier des images"
      />
    </div>,
    document.body,
  )
}
