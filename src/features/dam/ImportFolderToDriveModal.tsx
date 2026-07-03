// src/features/dam/ImportFolderToDriveModal.tsx
// Modal : importer N images d'un dossier local vers un dossier Google Drive choisi.
import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { FolderUp, Folder, Loader2, Images, CheckCircle2, AlertTriangle, Eraser } from 'lucide-react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/shared/CloseButton'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import { useDamFolderUpload, type FolderUploadResult } from './useDamFolderUpload'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface Props {
  open: boolean
  onClose: () => void
}

export function ImportFolderToDriveModal({ open, onClose }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [removeBg, setRemoveBg] = useState(false)
  const [dest, setDest] = useState<{ id: string; name: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<FolderUploadResult | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const { uploadFolder, progress, cancel, isImageFile } = useDamFolderUpload()

  const reset = useCallback(() => {
    setFiles([]); setDest(null); setResult(null); setRunning(false)
  }, [])

  const handleClose = () => { if (running) return; reset(); onClose() }

  const onFiles = (list: FileList | null) => {
    const imgs = Array.from(list ?? []).filter(isImageFile)
    if (!imgs.length) { toast.error('Aucune image dans la sélection (PNG, JPG, WebP, GIF, SVG)'); return }
    setFiles(imgs); setResult(null)
  }

  const run = async () => {
    if (!files.length || !dest) return
    setRunning(true); setResult(null)
    try {
      const res = await uploadFolder(files, dest.id, { removeBg })
      setResult(res)
      if (res.failed === 0) toast.success(`${res.ok} image(s) importée(s) dans « ${dest.name} »`)
      else toast.warning(`${res.ok} importée(s), ${res.failed} échec(s) — voir le détail`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l\'import')
    } finally {
      setRunning(false)
    }
  }

  if (!open) return null

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="w-[560px] max-w-[95vw] bg-background border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center"><FolderUp className="w-5 h-5 text-sky-400" /></div>
            <div>
              <p className="text-sm font-medium text-white">Importer un dossier → Drive</p>
              <p className="text-[11px] text-white/40">Envoie N images dans le dossier Drive de votre choix</p>
            </div>
          </div>
          <CloseButton onClick={handleClose} title="Fermer" />
        </header>

        <div className="p-5 flex flex-col gap-4">
          {/* 1. Source : un dossier complet OU des images choisies une à une */}
          <div className="rounded-lg border-2 border-dashed border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Images className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white">{files.length ? `${files.length} image(s) prête(s)` : 'Aucune image sélectionnée'}</p>
                <p className="text-[11px] text-white/40 truncate">{files.length ? files.slice(0, 3).map((f) => f.name).join(', ') + (files.length > 3 ? '…' : '') : 'PNG, JPG, WebP, GIF, SVG'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={running}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.04] hover:bg-sky-500/10 hover:text-sky-300 border border-white/10 text-sm text-white/80 transition-colors disabled:opacity-50"
              >
                <FolderUp className="w-4 h-4 shrink-0" />
                Choisir un dossier
              </button>
              <button
                type="button"
                onClick={() => filesInputRef.current?.click()}
                disabled={running}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/[0.04] hover:bg-sky-500/10 hover:text-sky-300 border border-white/10 text-sm text-white/80 transition-colors disabled:opacity-50"
              >
                <Images className="w-4 h-4 shrink-0" />
                Choisir des images
              </button>
            </div>
            {/* Sélection d'un dossier entier (toutes les images dedans) */}
            <input
              ref={folderInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              {...({ webkitdirectory: 'true', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
            />
            {/* Sélection d'images individuelles (sans webkitdirectory) */}
            <input
              ref={filesInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => { onFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          {/* 2. Dossier Drive */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={running}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-surface-2 transition-colors text-left disabled:opacity-50"
          >
            <Folder className="w-5 h-5 text-amber-300 shrink-0" fill="currentColor" fillOpacity={0.3} />
            <div className="min-w-0">
              <p className="text-sm text-white">{dest ? dest.name : 'Choisir le dossier Drive de destination'}</p>
              <p className="text-[11px] text-white/40">{dest ? 'Cliquer pour changer' : 'Parcourez votre Google Drive'}</p>
            </div>
          </button>

          {/* Option détourage : chaque image passe par le moteur (rembg/Remove.bg) → PNG alpha */}
          <label className="flex items-center gap-2.5 px-1 text-sm text-white/70 cursor-pointer select-none">
            <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)}
              disabled={running} className="accent-indigo-600 w-4 h-4" />
            <Eraser className="w-4 h-4 text-indigo-300 shrink-0" />
            <span>Détourer les images à l'import <span className="text-white/35">(fond supprimé → PNG)</span></span>
          </label>

          {/* Progression */}
          {running && progress && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-white/50">
                <span className="truncate">{progress.current ?? 'Préparation…'}</span>
                <span>{progress.done}/{progress.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Résultat */}
          {result && !running && (
            <div className="flex flex-col gap-1.5 text-[12px]">
              <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" />{result.ok} image(s) importée(s)</div>
              {result.failed > 0 && (
                <div className="flex items-start gap-2 text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{result.failed} échec(s) : {result.errors.slice(0, 2).map((e) => e.fileName).join(', ')}{result.errors.length > 2 ? '…' : ''}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          {running ? (
            <button onClick={cancel} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">Annuler</button>
          ) : (
            <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">{result ? 'Fermer' : 'Annuler'}</button>
          )}
          <button
            onClick={run}
            disabled={running || !files.length || !dest || !!result}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 disabled:bg-white/[0.06] disabled:text-white/30 text-[#fff] text-sm font-medium transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : result ? <CheckCircle2 className="w-4 h-4" /> : <FolderUp className="w-4 h-4" />}
            {running ? 'Import en cours…' : result ? 'Importé' : `Importer${files.length ? ` ${files.length}` : ''}`}
          </button>
        </footer>
      </div>

      <GDrivePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => { if (p.mimeType === FOLDER_MIME) { setDest({ id: p.id, name: p.name }); setResult(null) } }}
        foldersOnly
        title="Dossier de destination"
      />
    </div>,
    document.body,
  )
}
