// Déduplique un dossier Drive par CONTENU (md5) : aperçu des doublons → mise en
// corbeille (récupérable) des copies, en gardant le plus ancien de chaque groupe.
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Folder, Loader2, Trash2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/shared/CloseButton'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { trashDriveFiles } from './damCleanup'
import { planDedup, type DedupPlan } from './driveDedup'
import { t } from '@/lib/i18n'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

interface Props { open: boolean; onClose: () => void; initialFolder?: { id: string; name: string } | null }

export function DedupDriveModal({ open, onClose, initialFolder = null }: Props) {
  const { listAllForDedup } = useGoogleDrive()
  const [folder, setFolder] = useState<{ id: string; name: string } | null>(initialFolder)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [plan, setPlan] = useState<DedupPlan | null>(null)
  const [trashing, setTrashing] = useState(false)
  const [doneCount, setDoneCount] = useState<number | null>(null)

  const scan = useCallback(async (f: { id: string; name: string }) => {
    setScanning(true); setPlan(null); setDoneCount(null)
    try {
      const files = await listAllForDedup(f.id)
      setPlan(planDedup(files))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Analyse du dossier échouée')
    } finally {
      setScanning(false)
    }
  }, [listAllForDedup])

  // (Ré)initialise et lance le scan à l'ouverture si un dossier est fourni.
  useEffect(() => {
    if (!open) return
    setFolder(initialFolder); setPlan(null); setDoneCount(null)
    if (initialFolder) void scan(initialFolder)
  }, [open, initialFolder, scan])

  const handleClose = () => { if (trashing) return; onClose() }

  const apply = async () => {
    if (!plan || plan.removeIds.length === 0) return
    setTrashing(true)
    try {
      const n = await trashDriveFiles(plan.removeIds)
      setDoneCount(n)
      toast.success(`${n} doublon(s) déplacé(s) dans la corbeille Drive`)
      if (folder) void scan(folder) // re-scan → l'aperçu reflète l'état nettoyé
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Mise en corbeille échouée')
    } finally {
      setTrashing(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="w-[560px] max-w-[95vw] bg-background border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center"><Copy className="w-5 h-5 text-rose-400" /></div>
            <div>
              <p className="text-sm font-medium text-white">{t('dm.dedupTitle')}</p>
              <p className="text-[11px] text-white/40">{t('dm.dedupSub')}</p>
            </div>
          </div>
          <CloseButton onClick={handleClose} title="Fermer" />
        </header>

        <div className="p-5 flex flex-col gap-4">
          {/* Dossier */}
          <button type="button" onClick={() => setPickerOpen(true)} disabled={trashing}
            className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-white/10 hover:border-amber-500/40 hover:bg-surface-2 transition-colors text-left disabled:opacity-50">
            <Folder className="w-5 h-5 text-amber-300 shrink-0" fill="currentColor" fillOpacity={0.3} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{folder ? folder.name : 'Choisir le dossier à dédupliquer'}</p>
              <p className="text-[11px] text-white/40">{scanning ? 'Analyse…' : folder && plan ? `${plan.scanned} fichier(s) analysé(s)` : 'Parcourez votre Google Drive'}</p>
            </div>
            {scanning && <Loader2 className="w-4 h-4 text-white/40 animate-spin" />}
          </button>

          {/* Aperçu */}
          {plan && !scanning && (
            plan.duplicates === 0 ? (
              <div className="flex items-center gap-2 text-[12px] text-emerald-400 rounded-lg bg-well px-3 py-2.5">
                <ShieldCheck className="w-4 h-4" /> Aucun doublon — ce dossier est propre.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[12px] rounded-lg bg-well px-3 py-2.5">
                  <Copy className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-white/70">
                    {t('dm.dedupCount', { dup: plan.duplicates, groups: plan.groups.length, kept: plan.groups.length })}
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                  {plan.groups.slice(0, 30).map((g) => (
                    <div key={g.md5} className="text-[11px] rounded-md bg-white/[0.03] px-3 py-1.5">
                      <span className="text-emerald-300/80">⤷ garde</span> <span className="text-white/70">{g.keep.name}</span>
                      <span className="text-white/30"> · retire {g.remove.length} copie(s)</span>
                    </div>
                  ))}
                  {plan.groups.length > 30 && <p className="text-[11px] text-white/30 px-3">… et {plan.groups.length - 30} autre(s) groupe(s)</p>}
                </div>
              </>
            )
          )}

          {doneCount !== null && (
            <div className="flex items-center gap-2 text-[12px] text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />{doneCount} doublon(s) en corbeille — restaurable depuis Drive
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 transition-colors">Fermer</button>
          <button onClick={() => void apply()} disabled={trashing || scanning || !plan || plan.duplicates === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:bg-white/[0.06] disabled:text-white/30 text-[#fff] text-sm font-medium transition-colors">
            {trashing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {trashing ? 'Mise en corbeille…' : `Mettre en corbeille${plan?.duplicates ? ` ${plan.duplicates}` : ''}`}
          </button>
        </footer>
      </div>

      <GDrivePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(p) => { if (p.mimeType === FOLDER_MIME) { const f = { id: p.id, name: p.name }; setFolder(f); void scan(f) } }}
        foldersOnly
        title={t('dm.folderToDedup')}
      />
    </div>,
    document.body,
  )
}
