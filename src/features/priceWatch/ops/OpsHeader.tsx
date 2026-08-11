// Bandeau de tête du suivi : le run est-il vivant, depuis quand, et quand relance-t-il.
// ⚠ Le statut affiché vient TEL QUEL de `RunView` (Task 2) — un run mort depuis plus de
// `OPS_BEAT_MS` y est déjà réécrit « stopped » par `buildWatchOps`. Recalculer un seuil
// ici ferait mentir cet écran contre le Cockpit opérationnel, qui partage le même seuil.
import { Radio } from 'lucide-react'
import type { RunView } from './buildWatchOps'
import { useWorkflowSchedule } from '../dashboard/useWorkflowSchedule'
import { duration } from '../dashboard/format'
import { intlLocale, useTranslation } from '@/lib/i18n'

const TONE: Record<string, string> = {
  running: 'text-emerald-300 bg-emerald-500/12 border-emerald-500/30',
  success: 'text-white/70 bg-white/[0.05] border-white/10',
  partial: 'text-amber-300 bg-amber-500/12 border-amber-500/30',
  error: 'text-rose-300 bg-rose-500/12 border-rose-500/30',
  stopped: 'text-white/55 bg-white/[0.05] border-white/10',
}

export function OpsHeader({ run, workflowId }: { run: RunView | null; workflowId: string | null }) {
  const { t, locale } = useTranslation()
  const sched = useWorkflowSchedule(workflowId)
  const cronOn = !!sched?.enabled
  const overdue = cronOn && sched!.nextRunAt <= Date.now()
  // Écran trilingue : la langue de l'heure suit celle de l'interface, pas un « fr-FR » en
  // dur — même helper que `RunCardsStrip.tsx`.
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString(intlLocale(locale), { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-surface rounded-lg p-4 flex items-center gap-3 flex-wrap" data-pw-section="ops-header">
      <Radio className="w-4 h-4 text-indigo-400 shrink-0" />
      <h2 className="text-sm font-semibold text-white shrink-0">{t('ops.header.title')}</h2>

      {run ? (
        <span className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-0.5 border ${TONE[run.status] ?? TONE.stopped}`}>
          <span className={`w-2 h-2 rounded-full ${run.alive ? 'bg-emerald-400 animate-pulse' : 'bg-white/40'}`} />
          {t(`rd.wf.status.${run.status}` as 'rd.wf.status.running')}
          {run.trigger && <span className="opacity-70"> · {t(`rd.wf.trigger.${run.trigger}` as 'rd.wf.trigger.cron')}</span>}
        </span>
      ) : (
        <span className="text-[11px] text-white/40">{t('ops.header.noRun')}</span>
      )}

      {run && (
        <span className="text-[11px] text-white/45 tabular-nums">{t('ops.header.elapsed', { duration: duration(run.elapsedMs) })}</span>
      )}

      <span className="ml-auto text-[11px] text-white/40">
        {cronOn
          ? t('ops.header.next', { time: overdue ? t('ops.header.imminent') : hhmm(sched!.nextRunAt) })
          : t('ops.header.cronOff')}
      </span>
    </div>
  )
}
