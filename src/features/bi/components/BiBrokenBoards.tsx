// Les documents que le contrat REFUSE : présents en base, absents de la liste.
//
// ⚠⚠ Sans cet encart, ce sont des FANTÔMES : ils occupent l'espace de travail, comptent dans
// les quotas, reviennent à chaque lecture — et aucun geste de l'interface ne peut les
// atteindre, puisqu'ils n'apparaissent nulle part. Les taire serait la pire option ; les
// réparer automatiquement en serait une autre, qui inventerait un contenu que personne n'a
// écrit. On les NOMME, on dit pourquoi, et on offre de les supprimer.
import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { deleteDashboard } from '../store/dashboardsStore'
import type { BrokenBoard } from '../hooks/useDashboards'

export function BiBrokenBoards({ broken, uid, canEdit }: {
  broken: BrokenBoard[]
  uid: string | null
  canEdit: boolean
}) {
  const { t } = useTranslation()
  // ⚠ Le geste en cours : sans cet état, deux clics lancent deux suppressions, et la seconde
  // échoue sur un document déjà parti — un message d'erreur pour un succès.
  const [pending, setPending] = useState<string | null>(null)

  if (broken.length === 0) return null

  const remove = async (id: string) => {
    if (!uid) { toast.error(t('bi.board.deleteFailed')); return }
    setPending(id)
    try {
      await deleteDashboard(uid, id)
      toast.success(t('bi.broken.removed', { id }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.board.deleteFailed'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11.5px] text-amber-200">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {t('bi.broken.title', { count: broken.length })}
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {broken.map((b) => (
          <li key={b.id} className="flex items-center gap-2 text-[11px] text-white/60">
            {/* L'identifiant ET la cause : sans elle, on ne sait pas si le document est
                réparable ailleurs ou bon à jeter. */}
            <code className="text-white/80">{b.id}</code>
            <span className="truncate flex-1" title={b.reason}>{b.reason}</span>
            {canEdit && (
              <button type="button" disabled={pending === b.id} onClick={() => void remove(b.id)}
                className="shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                <Trash2 className="w-3 h-3" />{t('bi.board.delete')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
