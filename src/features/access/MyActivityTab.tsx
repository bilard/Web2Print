// Vue « Mon activité » : chaque utilisateur voit SES propres actions (QUOI/QUAND),
// avec possibilité de vider son propre historique.
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useMyAuditLog, clearAuditLogForUser } from './useAuditLog'
import { AuditLogView } from './admin/AuditLogView'
import { t } from '@/lib/i18n'

export function MyActivityTab() {
  const uid = useAuthStore((s) => s.user?.uid)
  const { data, isLoading, refetch } = useMyAuditLog()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  const clear = async () => {
    if (!uid) return
    setBusy(true)
    try {
      await clearAuditLogForUser(uid)
      await refetch()
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-white">{t('ac.myActivity')}</h3>
          <p className="text-xs text-white/45">{t('ac.myActivity.sub')}</p>
        </div>
        {confirm ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-white/60">Tout supprimer ?</span>
            <button onClick={clear} disabled={busy}
              className="text-xs px-2 py-1 rounded-lg bg-red-500/80 hover:bg-red-500 text-[#fff] disabled:opacity-50">
              {busy ? 'Suppression…' : 'Confirmer'}
            </button>
            <button onClick={() => setConfirm(false)} disabled={busy}
              className="text-xs px-2 py-1 rounded-lg text-white/60 hover:text-white">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} disabled={!data?.length}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-red-500/40 disabled:opacity-40 shrink-0">
            <Trash2 className="h-3.5 w-3.5" /> Vider l'historique
          </button>
        )}
      </div>
      <AuditLogView entries={data ?? []} loading={isLoading} onRefresh={() => refetch()} />
    </div>
  )
}
