// Modale « Gérer les suivis » : liste TOUS les suivis, chacun renommable (customLabel,
// prioritaire sur le nom du workflow que « Comparer catalogue » réécrit à chaque rapport)
// et supprimable directement. Confirmation INLINE par ligne (pas de 2e modale imbriquée,
// qui casserait le focus/click-outside). Une seule surface (AlertDialog).
import { useState } from 'react'
import { Trash2, Pencil } from 'lucide-react'
import { doc, setDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { db } from '@/lib/firebase/config'
import type { WatchSummary } from '../useCatalogReport'
import { deleteWatch } from '../reportStore'
import { useAuthStore } from '@/stores/auth.store'
import { when } from './format'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n'

export function WatchManager({ open, onOpenChange, watches, activeId }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  watches: WatchSummary[]
  activeId: string
}) {
  const { t } = useTranslation()
  const uid = useAuthStore((s) => s.user?.uid)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Renommage : `customLabel` (vide = retour au nom automatique du workflow).
  const rename = async (w: WatchSummary) => {
    if (!uid) return
    const label = editValue.trim()
    try {
      await setDoc(doc(db, 'users', uid, 'priceWatch', w.watchId), { customLabel: label || null }, { merge: true })
      toast.success(label ? t('pw.watch.renamed', { label }) : t('pw.watch.nameCleared'))
      setEditId(null)
    } catch (e) {
      toast.error(t('pw.watch.renameFailed', { message: String(e instanceof Error ? e.message : e) }))
    }
  }

  const remove = async (w: WatchSummary) => {
    if (!uid) return
    setBusyId(w.watchId)
    try {
      await deleteWatch(uid, w.watchId)
      toast.success(t('pw.watch.deleted', { label: w.label || w.watchId }))
      setConfirmId(null)
    } catch (e) {
      toast.error(t('pw.watch.deleteFailed', { message: String(e instanceof Error ? e.message : e) }))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('pw.watch.manage', { count: watches.length })}</AlertDialogTitle>
          <AlertDialogDescription>
            Supprime les suivis inutiles (résidus de test, doublons). Chaque suppression retire
            le tableau de bord et son historique — la config reste dans le workflow.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 divide-y divide-white/5">
          {watches.map((w) => (
            <div key={w.watchId} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                {editId === w.watchId ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      value={editValue} autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void rename(w); if (e.key === 'Escape') setEditId(null) }}
                      placeholder={t('pw.watch.namePlaceholder')}
                      className="flex-1 min-w-0 bg-well border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                    />
                    <button onClick={() => void rename(w)} className="text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded px-2 py-1">OK</button>
                    <button onClick={() => setEditId(null)} className="text-xs text-white/50 hover:text-white/80 px-1">Annuler</button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm text-white/85 truncate">
                      {w.label || w.watchId}
                      {w.watchId === activeId && <span className="ml-2 text-[10px] text-indigo-300">actif</span>}
                    </div>
                    <div className="text-[11px] text-white/35">{w.label ? w.watchId : '—'} · {when(w.lastReportAt)}</div>
                  </>
                )}
              </div>
              {editId !== w.watchId && (
                <button onClick={() => { setEditId(w.watchId); setEditValue(w.label ?? '') }} title="Renommer ce suivi"
                  className="shrink-0 p-1.5 rounded text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {confirmId === w.watchId ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => remove(w)} disabled={busyId === w.watchId}
                    className="text-xs bg-rose-600 hover:bg-rose-500 text-[#fff] rounded px-2 py-1">
                    {busyId === w.watchId ? '…' : 'Supprimer'}
                  </button>
                  <button onClick={() => setConfirmId(null)} disabled={busyId === w.watchId}
                    className="text-xs text-white/50 hover:text-white/80 px-1">Annuler</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(w.watchId)} title="Supprimer ce suivi"
                  className="shrink-0 p-1.5 rounded text-white/40 hover:text-rose-400 hover:bg-rose-500/10">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Fermer</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
