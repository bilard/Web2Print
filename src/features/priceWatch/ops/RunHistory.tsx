// Les vingt derniers runs (début, durée, issue, volume) et la tendance des durées, en clair.
import { Clock } from 'lucide-react'
import { useRunHistory } from './useRunHistory'
import { when, duration } from '../dashboard/format'
import { useTranslation } from '@/lib/i18n'

const STATUS_TONE: Record<string, string> = {
  success: 'text-emerald-400/80', partial: 'text-amber-300/80', error: 'text-rose-400', stopped: 'text-white/40',
}

export function RunHistory({ workflowId }: { workflowId: string | null }) {
  const { t } = useTranslation()
  const { runs, trend } = useRunHistory(workflowId)

  // Aucun run persisté encore : rien à raconter, pas de tableau vide muet.
  if (runs.length === 0) return null

  return (
    <div className="bg-surface rounded-lg p-4" data-pw-section="ops-history">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-3.5 h-3.5 text-white/40" />
        <h3 className="text-sm font-semibold text-white">{t('ops.history.title')}</h3>
        {/* La tendance ne se prononce qu'à partir de quatre runs terminés (durationTrend) —
            en dessous, `trend` est `null` et rien ne s'affiche plutôt qu'un chiffre inventé. */}
        {trend != null && (
          <span className={`text-[11px] tabular-nums ml-auto ${trend > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
            {trend > 0 ? t('ops.history.trend.up', { pct: trend }) : t('ops.history.trend.down', { pct: Math.abs(trend) })}
          </span>
        )}
      </div>
      <ul className="space-y-1 max-h-64 overflow-y-auto">
        {runs.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[12px] tabular-nums">
            <span className="text-white/50 w-32 shrink-0">{when(r.startedAt)}</span>
            <span className="text-white/70 w-16 shrink-0">
              {r.endedAt != null ? duration(r.endedAt - r.startedAt) : '—'}
            </span>
            <span className={`w-20 shrink-0 ${STATUS_TONE[r.status] ?? 'text-white/50'}`}>
              {t(`rd.wf.status.${r.status}` as 'rd.wf.status.running')}
            </span>
            <span className="text-white/35 flex-1 truncate text-right">
              {t('ops.history.nodes', { n: r.nodesTotal })}
              {r.nodesError > 0 ? ` · ${t('ops.history.errors', { n: r.nodesError })}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
