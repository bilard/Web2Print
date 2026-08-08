import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { CalendarClock, Play, Loader2, Square, PauseCircle } from 'lucide-react'
import { toast } from 'sonner'
import { db, functions } from '@/lib/firebase/config'
import { formatCountdown } from '../runtime/cronLabels'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { breaksServerRun } from '../runtime/serverCapability'
import { nodeRegistry } from '../registry'
import { saveWorkflow } from '../persistence/workflowsApi'
import { useTranslation } from '@/lib/i18n'
import { useCan } from '@/features/access/useAccess'

interface ScheduleDoc {
  enabled: boolean; every: number; unit: string
  nextRunAt: number; lastRunAt?: number; lastStatus?: string
  /** Message du dernier échec (persisté par le scheduler) — affiché au survol du ⚠. */
  lastError?: string
  /** Cycle de moisson terminé à 100 % — nextRunAt = prochaine échéance CALENDAIRE. */
  cycleWaiting?: boolean
}

// timeout aligné sur la Function (540 s) : un run avec escalade Bright Data dépasse
// largement le défaut httpsCallable de 70 s → « deadline-exceeded » alors que le run
// serveur aboutissait. L'état des cartes vient en parallèle via useServerRunLive.
const runNow = httpsCallable<{ workflowId: string }, { status: string; nodeCount: number; errorCount: number }>(
  functions, 'runWorkflowNow', { timeout: 1800_000 },
)

export function CronStatusPanel({ workflowId, children }: { workflowId: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [running, setRunning] = useState(false)
  // Lancer et arrêter relèvent de l'EXÉCUTION ; suspendre désactive le node Cron,
  // donc modifie le workflow. Deux droits distincts, deux boutons distincts.
  const canRun = useCan('workflows.run')
  const canEdit = useCan('workflows.edit')

  useEffect(() => onSnapshot(doc(db, 'workflowSchedules', workflowId),
    (s) => setSched(s.exists() ? (s.data() as ScheduleDoc) : null),
    (err) => console.warn('[cron] écoute Firestore interrompue :', err.message)), [workflowId])

  useEffect(() => {
    if (!sched?.enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [sched?.enabled])

  // Sans planification active : pas de bloc de statut, mais les contrôles de run
  // (Pas à pas / Run) doivent rester visibles → on les rend nus.
  if (!sched?.enabled) return <>{children}</>

  const onRun = async () => {
    // Refus AVANT l'appel : une carte que le serveur ne sait pas exécuter met le run en
    // erreur et fait sauter tout l'aval. Partir quand même, c'est attendre plusieurs
    // minutes pour lire l'échec dans les logs — exactement ce qu'on cherche à éviter.
    // Ce bouton ne passe pas par le pré-vol du canevas : le contrôle est donc refait ici.
    const wfNow = useWorkflowStore.getState().current
    const blocking = wfNow?.nodes.find((n) => breaksServerRun(n.type))
    if (blocking) {
      const label = nodeRegistry.get(blocking.type)?.labelKey
      toast.error(t('wfx.serverBlocked', { label: label ? t(label) : blocking.type }))
      return
    }
    setRunning(true)
    // Un run CLIENT resté « en cours » (isRunning) masque l'écho serveur sur les cartes
    // (garde dans hydrateServerRun). On le réinitialise : le run lancé ici est serveur,
    // sa progression doit s'afficher en direct via useServerRunLive.
    useRunContext.getState().resetRun()
    try {
      const { data } = await runNow({ workflowId })
      if (data.errorCount > 0) toast.warning(t('wfx.serverRun', { nodes: data.nodeCount, errors: data.errorCount }))
      else toast.success(t('wfx.serverRunOk', { nodes: data.nodeCount }))
    } catch (e) {
      toast.error(t('wfx.serverRunFailed', { message: String(e instanceof Error ? e.message : e) }))
    } finally { setRunning(false) }
  }

  // STOP : pose un flag d'abandon que l'executor serveur poll (abort sous ~3 s).
  const onStop = async () => {
    const uid = getWorkspaceUid()
    if (!uid) return
    try {
      await setDoc(doc(db, 'users', uid, 'workflowAbort', workflowId), { requested: true, ts: Date.now() })
      toast.info(t('wfx.stopRequested'))
    } catch (e) {
      toast.error(t('wfx.stopFailed', { message: String(e instanceof Error ? e.message : e) }))
    }
  }

  // SUSPENDRE LE FLUX : STOP n'arrête qu'UN run — le cron relance au tick suivant. Pour
  // vraiment arrêter le flux, on désactive le node Cron (enabled=false). `saveWorkflow`
  // resynchronise le planning : `findActiveCron` renvoie null → le doc workflowSchedules
  // est SUPPRIMÉ → le scanner ne reprend plus ce workflow. On abandonne aussi le run en
  // cours au passage (pour un arrêt immédiat et complet).
  const onSuspend = async () => {
    const uid = getWorkspaceUid()
    const wf = useWorkflowStore.getState().current
    if (!uid || !wf) return
    const cronNode = wf.nodes.find((n) => n.type === 'cron' && (n.config as { enabled?: boolean })?.enabled)
    if (!cronNode) { toast.info(t('wfx.noCron')); return }
    try {
      const nextNodes = wf.nodes.map((n) =>
        n.id === cronNode.id ? { ...n, config: { ...(n.config as object), enabled: false } } : n)
      const next = { ...wf, nodes: nextNodes }
      useWorkflowStore.getState().setNodes(nextNodes)
      await setDoc(doc(db, 'users', uid, 'workflowAbort', workflowId), { requested: true, ts: Date.now() }) // arrête un run en cours
      await saveWorkflow(uid, next) // supprime le planning → plus de relance
      toast.success(t('wfx.suspended'))
    } catch (e) {
      toast.error(t('wfx.suspendFailed', { message: String(e instanceof Error ? e.message : e) }))
    }
  }

  // Heure « 23:41 » (concrète, ce que l'utilisateur veut voir).
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  // Échéance calendaire (souvent à plusieurs jours) : jour + heure, pas seulement HH:MM.
  const dayTime = (ms: number) => new Date(ms).toLocaleString('fr-FR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  // « En cours » = run lancé depuis ce client, OU le serveur a marqué le planning en cours.
  const isRunning = running || sched.lastStatus === 'running'
  const overdue = sched.nextRunAt <= now

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs">
      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
      {isRunning ? (
        // Texte sur 2 lignes pour réduire la largeur : ligne 1 = statut + démarré,
        // ligne 2 = reprise auto (le segment le plus long).
        <span className="flex flex-col gap-0.5 leading-tight" title={t('wfx.running.help')}>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <b className="text-emerald-300">{t('wfx.running')}</b>
            {sched.lastRunAt && <span className="text-indigo-200/80">· démarré {hhmm(sched.lastRunAt)} (il y a {formatCountdown(now - sched.lastRunAt)})</span>}
          </span>
          {/* Pendant un run, nextRunAt = échéance du VERROU : l'heure à laquelle le
              scanner reprendra la main quoi qu'il arrive (fin, pause ou crash).
              Décompte LIVE (tick 1 s du panneau) pour voir l'échéance approcher. */}
          <span className="pl-3 text-amber-300/90">
            reprise auto ≤ <b className="text-amber-200">{hhmm(sched.nextRunAt)}</b>{' '}
            {overdue ? <b className="text-amber-200">(imminente)</b> : <>(dans <b className="tabular-nums text-amber-200">{formatCountdown(sched.nextRunAt - now)}</b>)</>}
          </span>
        </span>
      ) : sched.cycleWaiting ? (
        // 2 lignes pour réduire la largeur : ligne 1 = état, ligne 2 = prochaine relance.
        <span className="flex flex-col gap-0.5 leading-tight" title={t('wfx.cycleDone.help')}>
          <b className="text-emerald-300">{t('wfx.cycleDone')}</b>
          <span className="text-indigo-200/70">
            Relance <b className="capitalize text-indigo-200">{dayTime(sched.nextRunAt)}</b>{' '}
            ({overdue ? 'imminente' : `dans ${formatCountdown(sched.nextRunAt - now)}`})
          </span>
        </span>
      ) : (
        // 2 lignes pour réduire la largeur : ligne 1 = dernier run, ligne 2 = prochain run.
        <span className="flex flex-col gap-0.5 leading-tight" title={t('wfx.scheduleActive')}>
          <span>
            {sched.lastRunAt
              ? <>{t('wfx.last')} <b>{hhmm(sched.lastRunAt)}</b> <span className="text-indigo-200/70">(il y a {formatCountdown(now - sched.lastRunAt)})</span> {
                  // 'stopped' = STOP volontaire, à ne pas confondre avec un échec (⚠) ni
                  // avec une fin normale (✓) — sinon l'arrêt demandé reste invisible.
                  sched.lastStatus === 'stopped'
                    ? <span className="text-rose-300 cursor-help" title={t('wfx.stopped.help')}>{t('wfx.stoppedBadge')}</span>
                    : sched.lastStatus === 'error'
                      ? <span className="text-rose-300 cursor-help" title={sched.lastError ?? t('wfx.lastFailed')}>⚠</span>
                      : <span className="text-emerald-300">✓</span>
                }</>
              : <span className="text-indigo-200/70">{t('wfx.neverRun')}</span>}
          </span>
          <span>{t('wfx.next')} <b>{hhmm(sched.nextRunAt)}</b> <span className="text-indigo-200/70">({overdue ? 'imminent' : `dans ${formatCountdown(sched.nextRunAt - now)}`})</span></span>
        </span>
      )}
      {isRunning && canRun ? (
        // STOP disponible pour TOUT run serveur en cours — lancé d'ici, par le cron, ou
        // depuis un autre poste (le flag d'abandon Firestore est lu par l'executor).
        <button
          onClick={onStop}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/25 hover:bg-red-500/40 text-red-200"
          title={t('wfx.stop.help')}
        >
          <Square className="w-3 h-3" />
          STOP
          {running && <Loader2 className="w-3 h-3 animate-spin" />}
        </button>
      ) : canRun ? (
        <button
          onClick={onRun}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/25 hover:bg-indigo-500/40"
          title={t('wfx.runNow')}
        >
          <Play className="w-3 h-3" />
          {t('wfx.runServer')}
        </button>
      ) : null}
      {/* SUSPENDRE : arrête le flux DURABLEMENT (désactive le cron) — toujours dispo tant
          que la planification est active, que le run soit en cours ou entre deux runs. */}
      {canEdit && (
      <button
        onClick={onSuspend}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200"
        title={t('wfx.suspend.help')}
      >
        <PauseCircle className="w-3 h-3" />
        {t('wfx.suspendLabel')}
      </button>
      )}
      {/* Contrôles de run (Pas à pas / Run / Stop / Étape) intégrés DANS le bloc,
          séparés des actions serveur par un filet vertical. */}
      {children && <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/15">{children}</div>}
    </div>
  )
}
