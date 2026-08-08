// État du dernier run serveur, en tête de la vue Workflow.
//
// ⚠ Il manquait entièrement : la vue montrait un graphe avec des pastilles de couleur,
// sans jamais dire si le run tournait, quand il avait démarré, combien de temps il avait
// duré, ni combien de nodes avaient échoué. Une pastille rouge sans contexte ne se
// diagnostique pas depuis un téléphone.
import { AlertTriangle, Check, CircleDot, Loader2, Octagon } from 'lucide-react'
import type { RunSummary, RunStatus } from '@/features/priceWatch/radar/runLive'
import { timeAgo, hhmm } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

const TONE: Record<RunStatus, { color: string; Icon: typeof Check }> = {
  running: { color: 'var(--radar-accent-2)', Icon: Loader2 },
  success: { color: '#34d399', Icon: Check },
  partial: { color: '#fbbf24', Icon: AlertTriangle },
  error: { color: '#fb7185', Icon: AlertTriangle },
  stopped: { color: 'var(--radar-text-3)', Icon: Octagon },
}

/** Durée lisible : « 42 s », « 6 min », « 1 h 12 ». */
function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function RadarRunStatus({ run }: { run: RunSummary | null }) {
  if (!run || !run.status) {
    return (
      <p className="text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{t('rd.wf.noRun')}</p>
    )
  }
  const tone = TONE[run.status] ?? TONE.stopped
  const { Icon } = tone

  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-2 text-[12px]">
        <Icon size={14} color={tone.color} className={run.running ? 'animate-spin' : undefined} />
        <b style={{ color: tone.color }}>{t(`rd.wf.status.${run.status}` as 'rd.wf.status.running')}</b>
        {run.trigger && (
          <span style={{ color: 'var(--radar-text-3)' }}>
            · {t(`rd.wf.trigger.${run.trigger}` as 'rd.wf.trigger.cron', {}) || run.trigger}
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums" style={{ color: 'var(--radar-text-3)' }}>
          {run.durationMs != null ? duration(run.durationMs) : '—'}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
        {run.startedAt != null && (
          <span>{t('rd.wf.startedAt', { time: hhmm(run.startedAt), ago: timeAgo(run.startedAt) })}</span>
        )}
        {/* Les compteurs par état : un « 9 OK · 1 en erreur » se lit d'un coup d'œil, là où
            dix pastilles réparties dans un graphe demandent de le parcourir. */}
        <span className="tabular-nums">
          {t('rd.wf.nodesOk', { ok: run.nodes.ok, total: run.nodes.total })}
        </span>
        {run.nodes.running > 0 && (
          <span className="tabular-nums" style={{ color: 'var(--radar-accent-2)' }}>
            <CircleDot size={10} className="inline mr-0.5" />{run.nodes.running}
          </span>
        )}
        {run.nodes.error > 0 && (
          <span className="tabular-nums" style={{ color: '#fb7185' }}>
            {t('rd.wf.nodesError', { count: run.nodes.error })}
          </span>
        )}
        {run.nodes.skipped > 0 && (
          <span className="tabular-nums">{t('rd.wf.nodesSkipped', { count: run.nodes.skipped })}</span>
        )}
        {run.warnings > 0 && (
          <span className="tabular-nums" style={{ color: '#fbbf24' }}>
            {t('rd.wf.warnCount', { count: run.warnings })}
          </span>
        )}
      </div>
    </div>
  )
}
