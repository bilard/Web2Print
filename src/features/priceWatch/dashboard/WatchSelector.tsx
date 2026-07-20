// src/features/priceWatch/dashboard/WatchSelector.tsx
// Sélecteur de la SOURCE du tableau de bord (le suivi actif) + suppression d'un suivi
// (pour purger les résidus de test). Suppression = irréversible → confirmation IN-APP
// (AlertDialog, jamais window.confirm). Retire le doc racine + rapports (cf. deleteWatch).
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WatchSummary } from '../useCatalogReport'
import { deleteWatch } from '../reportStore'
import { useAuthStore } from '@/stores/auth.store'
import { when } from './format'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'

export function WatchSelector({ watches, value, onChange }: {
  watches: WatchSummary[]
  value: string
  onChange: (id: string) => void
}) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  if (watches.length === 0) return null

  const current = watches.find((w) => w.watchId === value)
  const currentLabel = current?.label || current?.watchId || value

  const doDelete = async () => {
    if (!uid || !value) return
    setBusy(true)
    try {
      await deleteWatch(uid, value)
      toast.success(`Suivi « ${currentLabel} » supprimé.`)
      setConfirm(false)
    } catch (e) {
      toast.error(`Suppression impossible : ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-white/40">Source</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-well text-white/80 text-sm rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25">
        {watches.map((w) => (
          <option key={w.watchId} value={w.watchId}>
            {w.label || w.watchId}{w.lastReportAt ? ` — ${when(w.lastReportAt)}` : ''}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setConfirm(true)} title="Supprimer ce suivi"
        className="p-1.5 rounded border border-white/10 text-white/40 hover:text-rose-400 hover:border-rose-400/30">
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le suivi « {currentLabel} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le tableau de bord de ce suivi et son historique seront supprimés définitivement.
              La configuration reste dans le workflow — relancer le comparatif recréera un suivi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doDelete() }} disabled={busy}
              className="bg-rose-600 hover:bg-rose-500 text-[#fff]">
              {busy ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
