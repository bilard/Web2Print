import { useEffect, useState } from 'react'
import { CalendarClock, Loader2, PauseCircle, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { formatCountdown } from '@/features/workflows/runtime/cronSchedule'
import { hhmm } from '@/features/priceWatch/radar/radarFormat'
import type { RadarSchedule, RunPulse } from '@/features/priceWatch/radar/scrapeState'
import { runWorkflowNow, stopServerRun, suspendWorkflow } from '@/features/priceWatch/radar/radarScheduleActions'

/** Échéance calendaire (souvent à plusieurs jours) : jour + heure, pas seulement HH:MM. */
const dayTime = (ms: number) => new Date(ms).toLocaleString('fr-FR', {
  weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
})

function Action({ onClick, busy, tone, icon: Icon, label }: {
  onClick: () => void; busy?: boolean; tone: 'stop' | 'warn' | 'go'; icon: typeof Play; label: string
}) {
  const styles = {
    stop: { background: 'rgba(255, 69, 58, 0.22)', color: '#ff8a80', border: '0.5px solid rgba(255, 69, 58, 0.45)' },
    warn: { background: 'rgba(217, 119, 6, 0.22)', color: '#fbbf24', border: '0.5px solid rgba(217, 119, 6, 0.45)' },
    go: { background: 'var(--radar-accent-soft)', color: 'var(--radar-accent-2)', border: '0.5px solid rgba(99, 102, 241, 0.45)' },
  }[tone]
  return (
    <button onClick={onClick} disabled={busy}
      className="radar-tap flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold disabled:opacity-50"
      style={styles}>
      {busy ? <Loader2 size={14} className="radar-spin" /> : <Icon size={14} />}
      {label}
    </button>
  )
}

/** Bandeau du planificateur, ÉPINGLÉ en tête de l'onglet Scraping (rendu dans la barre
 *  de titre sticky) : où en est le run serveur et les commandes STOP / Suspendre /
 *  Lancer. Parité avec le CronStatusPanel de l'app. */
export function RadarScheduleBar({ sched, pulse, workflowId, now }: {
  sched: RadarSchedule | null
  /** Ce qui tourne VRAIMENT : un « Lancer » manuel (ou un flux suspendu en cours de run)
   *  n'apparaît PAS dans le planning — sans lui, le bandeau proposait « Lancer » pendant
   *  qu'un run tournait, et n'offrait aucun STOP pour l'arrêter. */
  pulse: RunPulse
  workflowId: string | null
  now: number
}) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [busy, setBusy] = useState<'stop' | 'suspend' | 'run' | null>(null)
  // Arrêt demandé mais pas encore acté par le serveur (poll toutes les 3 s) : sans cet
  // état transitoire, l'écran reste « En cours » et l'action paraît sans effet.
  const [stopAsked, setStopAsked] = useState(false)
  const running = pulse.active
  const startedAt = pulse.startedAt
  const stopped = sched?.lastStatus === 'stopped'
  const overdue = !!sched && sched.nextRunAt <= now
  // Le serveur a rendu la main (run terminé/arrêté) → la demande d'arrêt est consommée.
  useEffect(() => { if (!running) setStopAsked(false) }, [running, sched?.lastRunAt])

  const guard = async (kind: 'stop' | 'suspend' | 'run', fn: () => Promise<void>) => {
    if (!uid || !workflowId) { toast.error('Workflow inconnu pour ce suivi.'); return }
    setBusy(kind)
    try { await fn() } catch (e) { toast.error(e instanceof Error ? e.message : 'Action impossible.') } finally { setBusy(null) }
  }

  const onStop = () => guard('stop', async () => {
    await stopServerRun(uid!, workflowId!)
    setStopAsked(true)
    toast.info('Arrêt demandé — le run s’interrompra dans quelques secondes.')
  })

  // Action la MOINS réversible depuis un mobile (un doigt qui glisse couperait le flux) :
  // confirmation explicite avant de désactiver le cron.
  const onSuspend = () => {
    if (!window.confirm('Suspendre le flux ?\n\nLe cron est désactivé : plus aucune relance automatique (réactivable dans le node Cron de l’app).')) return
    void guard('suspend', async () => {
      const done = await suspendWorkflow(uid!, workflowId!)
      if (done) toast.success('Flux suspendu — plus aucune relance automatique.')
      else toast.info('Aucun cron actif à suspendre.')
    })
  }

  const onRun = () => guard('run', async () => {
    const r = await runWorkflowNow(workflowId!)
    if (r.errorCount > 0) toast.warning(`Run serveur : ${r.nodeCount} node(s), ${r.errorCount} erreur(s).`)
    else toast.success(`Run serveur OK — ${r.nodeCount} node(s).`)
  })

  const relance = sched?.enabled
    ? <>relance {overdue ? <b>imminente</b> : <>à <b>{hhmm(sched.nextRunAt)}</b> (dans <b className="radar-tnum">{formatCountdown(sched.nextRunAt - now)}</b>)</>}</>
    : null

  return (
    <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2"
      style={{ background: 'var(--radar-accent-soft)', border: '0.5px solid rgba(99, 102, 241, 0.3)' }}>
      <CalendarClock size={16} className="shrink-0" style={{ color: 'var(--radar-accent-2)' }} />
      <div className="min-w-0 flex-1 text-[12px] leading-tight">
        {running ? (
          <>
            <p className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full radar-live-dot" style={{ background: 'var(--radar-live)' }} />
              <b style={{ color: 'var(--radar-live)' }}>En cours</b>
              {startedAt != null && (
                <span className="truncate" style={{ color: 'var(--radar-text-2)' }}>
                  · démarré {hhmm(startedAt)} (il y a {formatCountdown(now - startedAt)})
                </span>
              )}
            </p>
            {stopAsked ? (
              <p className="mt-0.5 flex items-center gap-1.5" style={{ color: '#ff8a80' }}>
                <Loader2 size={11} className="radar-spin shrink-0" />
                <b>Arrêt demandé</b> — interruption dans quelques secondes…
              </p>
            ) : (
              // Pendant un run, nextRunAt = échéance du VERROU anti-chevauchement (budget
              // de run + marge), PAS la cadence : l'heure à laquelle le scanner reprend la
              // main quoi qu'il arrive (fin, pause ou crash).
              sched ? (
                <p className="mt-0.5 radar-tnum" style={{ color: '#fbbf24' }}>
                  reprise auto ≤ <b>{hhmm(sched.nextRunAt)}</b> {overdue ? <b>(imminente)</b> : <>(dans <b>{formatCountdown(sched.nextRunAt - now)}</b>)</>}
                </p>
              ) : (
                // Run lancé à la main sans planification : aucun verrou, aucune relance.
                <p className="mt-0.5" style={{ color: 'var(--radar-text-2)' }}>run manuel · aucune relance programmée</p>
              )
            )}
          </>
        ) : stopped ? (
          // Preuve VISIBLE que le STOP a agi : sans elle, le cron relance dans la minute et
          // l'utilisateur conclut que le bouton est mort (c'est arrivé).
          <>
            <p><b style={{ color: '#ff8a80' }}>■ Run arrêté</b>{sched?.lastRunAt != null && <span style={{ color: 'var(--radar-text-2)' }}> · démarré {hhmm(sched.lastRunAt)}</span>}</p>
            <p className="mt-0.5" style={{ color: 'var(--radar-text-2)' }}>
              ⚠ le cron {relance ?? 'ne relancera pas'} — <b>Suspendre</b> pour ne plus relancer.
            </p>
          </>
        ) : sched?.cycleWaiting ? (
          <>
            <p><b style={{ color: 'var(--radar-live)' }}>Cycle terminé ✓</b></p>
            <p className="mt-0.5 truncate" style={{ color: 'var(--radar-text-2)' }}>
              Relance <b className="capitalize">{dayTime(sched.nextRunAt)}</b> ({overdue ? 'imminente' : `dans ${formatCountdown(sched.nextRunAt - now)}`})
            </p>
          </>
        ) : sched?.enabled ? (
          <>
            <p style={{ color: 'var(--radar-text-2)' }}>
              {sched.lastRunAt != null
                ? <>Dernier <b style={{ color: 'var(--radar-text)' }}>{hhmm(sched.lastRunAt)}</b> {sched.lastStatus === 'error' ? <span style={{ color: 'var(--radar-bad)' }}>⚠</span> : <span style={{ color: 'var(--radar-live)' }}>✓</span>}</>
                : 'Jamais exécuté'}
            </p>
            <p className="mt-0.5 radar-tnum" style={{ color: 'var(--radar-text-2)' }}>
              Prochain <b style={{ color: 'var(--radar-text)' }}>{hhmm(sched.nextRunAt)}</b> ({overdue ? 'imminent' : `dans ${formatCountdown(sched.nextRunAt - now)}`})
            </p>
          </>
        ) : (
          <p style={{ color: 'var(--radar-text-2)' }}>Planification inactive — moisson manuelle uniquement.</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {running
          ? <Action onClick={onStop} busy={busy === 'stop' || stopAsked} tone="stop" icon={Square} label={stopAsked ? 'Arrêt…' : 'STOP'} />
          : <Action onClick={onRun} busy={busy === 'run'} tone="go" icon={Play} label="Lancer" />}
        {sched?.enabled && <Action onClick={onSuspend} busy={busy === 'suspend'} tone="warn" icon={PauseCircle} label="Suspendre" />}
      </div>
    </div>
  )
}
