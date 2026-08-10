// Cartes du run EN DIRECT, dans l'ordre où elles ont tourné. Un clic ouvre le flux sur la
// carte — même intent que la bande d'avancement de l'éditeur (`useFocusNode`).
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Loader2, AlertCircle, MinusCircle, Circle } from 'lucide-react'
import { useFocusNode } from '../../workflows/editor/focusNodeStore'
import type { NodeStatus } from '../../workflows/types'
import { useLiveRunCards } from './useLiveRunCards'
import { duration } from '../dashboard/format'
import { intlLocale, useTranslation } from '@/lib/i18n'

const ICON: Record<NodeStatus, typeof Circle> = {
  pending: Circle, running: Loader2, success: CheckCircle2, error: AlertCircle, skipped: MinusCircle,
}
const TINT: Record<NodeStatus, string> = {
  pending: 'text-white/25', running: 'text-indigo-300', success: 'text-emerald-400/80',
  error: 'text-rose-400', skipped: 'text-amber-300/70',
}

export function RunCardsStrip({ workflowId }: { workflowId: string | null }) {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const progress = useLiveRunCards(workflowId)

  /** Sélectionne la carte dans l'éditeur (store partagé) puis y navigue — le focus est déjà
   *  posé quand le canvas monte, comme le fait le popup de cohérence. */
  const openCard = (id: string) => {
    if (!workflowId) return
    useFocusNode.getState().focus(id)
    navigate(`/workflows/${workflowId}`)
  }

  // Rien démarré : une bande à zéro se lirait comme une panne plutôt que comme une absence.
  if (!progress || progress.total === 0 || (progress.done === 0 && progress.running === 0)) return null

  return (
    <div className="bg-surface rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-2">{t('ops.cards.title')}</h3>
      <div className="flex flex-wrap gap-1.5">
        {progress.cards.map((c) => {
          const Icon = ICON[c.status]
          return (
            <button key={c.id} type="button" onClick={() => openCard(c.id)}
              title={t('ops.cards.open')}
              className={`flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-[11px] transition-colors hover:bg-white/[0.08] ${
                c.status === 'running' ? 'bg-indigo-500/10 border border-indigo-400/25' : 'bg-well'
              }`}>
              <Icon className={`w-3 h-3 shrink-0 ${TINT[c.status]} ${c.status === 'running' ? 'animate-spin' : ''}`} />
              <span className={c.status === 'pending' ? 'text-white/30' : 'text-white/70'}>{c.label}</span>
              {typeof c.count === 'number' && c.count > 0 && (
                <span className="tabular-nums text-white/45">{c.count.toLocaleString(intlLocale(locale))}</span>
              )}
              {(c.cycles ?? 0) > 1 && <span className="tabular-nums text-indigo-300/70">×{c.cycles}</span>}
              {c.durationMs != null && c.durationMs > 1000 && (
                <span className="tabular-nums text-white/25">{duration(c.durationMs)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
