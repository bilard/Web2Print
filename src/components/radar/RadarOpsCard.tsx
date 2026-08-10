// Carte compacte « Suivi » de la PWA radarPrice : ce qui tourne, ce qu'il reste par
// chantier, la dernière panne. Aucun calcul ici — la carte appelle `useWatchOps` (Task 10),
// LE MÊME hook que l'écran desktop « Suivi », et se contente d'en rendre le résultat : un
// second moteur de calcul finirait par diverger, et c'est depuis le téléphone qu'on décide
// de NE PAS relancer un traitement.
import { Activity, AlertTriangle } from 'lucide-react'
import type { RunView, Chantier } from '@/features/priceWatch/ops/buildWatchOps'
import type { WatchIncident } from '@/features/priceWatch/ops/opsTypes'
import type { OpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { useWatchOps } from '@/features/priceWatch/ops/useWatchOps'
import { chantierLabelKey, etaParts } from '@/features/priceWatch/ops/opsFormat'
import { fmtDuration, timeAgo } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

const RUN_COLOR: Record<string, string> = {
  running: 'var(--radar-live)', success: 'var(--radar-text-2)',
  partial: '#fbbf24', error: '#fb7185', stopped: 'var(--radar-text-3)',
}

function RunLine({ run }: { run: RunView | null }) {
  if (!run) {
    return <p className="text-[12px]" style={{ color: 'var(--radar-text-3)' }}>{t('ops.header.noRun')}</p>
  }
  const color = RUN_COLOR[run.status] ?? RUN_COLOR.stopped
  return (
    <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--radar-text-2)' }}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${run.alive ? 'radar-live-dot' : ''}`} style={{ background: color }} />
      <b style={{ color }}>{t(`rd.wf.status.${run.status}` as 'rd.wf.status.running')}</b>
      {run.trigger && <span>· {t(`rd.wf.trigger.${run.trigger}` as 'rd.wf.trigger.cron')}</span>}
      <span className="radar-tnum ml-auto shrink-0" style={{ color: 'var(--radar-text-3)' }}>{fmtDuration(run.elapsedMs)}</span>
    </div>
  )
}

/** Sous-texte à droite d'une barre : l'estimation ne se présente QUE comme une durée
 *  restante (jamais une heure de fin) — même règle que `ChantierCard` (écran desktop). */
function ChantierBar({ c }: { c: Chantier }) {
  const eta = !c.stale && c.etaMs != null ? etaParts(c.etaMs) : null
  const trailing = c.stale
    ? t('ops.card.stale')
    : eta
      ? (eta.h > 0 ? t('ops.card.eta.hm', eta) : t('ops.card.eta.m', eta))
      : `${c.pct}%`
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]" style={{ color: 'var(--radar-text-2)' }}>
        <span>{t(chantierLabelKey(c.id))}</span>
        <span className="radar-tnum" style={{ color: 'var(--radar-text-3)' }}>{trailing}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${c.pct}%`, background: c.stale ? 'var(--radar-text-3)' : 'var(--radar-accent-2)' }}
        />
      </div>
    </div>
  )
}

/** Dernier incident, ou son absence — un journal vide N'EST PAS muet, il dit qu'aucune
 *  panne n'est survenue (même principe que `IncidentLog`, écran desktop). */
function LastIncident({ incident }: { incident: (WatchIncident & { id: string }) | null }) {
  return (
    <div
      className="mt-3 flex items-start gap-1.5 border-t pt-2 text-[11px]"
      style={{ borderColor: 'var(--radar-hair)', color: 'var(--radar-text-3)' }}
    >
      <AlertTriangle size={12} className="mt-0.5 shrink-0" color={incident ? '#fb7185' : 'var(--radar-text-3)'} />
      {incident ? (
        <p className="min-w-0 flex-1 truncate">
          <span style={{ color: 'var(--radar-text-2)' }}>{timeAgo(incident.ts)}</span>
          {incident.domain && <> · {incident.domain}</>} — {incident.message}
        </p>
      ) : (
        <p>Aucun incident récent</p>
      )}
    </div>
  )
}

export function RadarOpsCard({ watchId, workflowId, ops }: {
  watchId: string | null
  workflowId: string | null
  ops: OpsCockpit | null
}) {
  // ⚠ Hook appelé EN PREMIER, avant tout retour anticipé (rules-of-hooks). Il porte son
  // propre tic à la seconde (durées écoulées/estimations) : l'isoler ICI, dans la carte,
  // plutôt que dans `RadarApp`, borne ce re-rendu à la carte — pas tout l'écran d'aperçu.
  const { view, incidents } = useWatchOps(watchId, workflowId ?? undefined, ops)

  // Rien à publier : ni run, ni chantier — la carte se tait plutôt que d'occuper l'écran
  // avec un « aucun run » qu'aucun autre indice ne vient étayer.
  if (!view.run && view.chantiers.length === 0) return null

  return (
    <section className="radar-card radar-in p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Activity size={13} color="var(--radar-accent-2)" />
        <b className="text-[12.5px]">Suivi</b>
      </div>

      <RunLine run={view.run} />

      {view.chantiers.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {view.chantiers.map((c) => <ChantierBar key={c.id} c={c} />)}
        </div>
      )}

      <LastIncident incident={incidents[0] ?? null} />
    </section>
  )
}
