// src/features/workflows/editor/CronStatusPanel.tsx
import { useEffect, useState, type ReactNode } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { CalendarClock, Play, Loader2, Square, PauseCircle } from 'lucide-react'
import { toast } from 'sonner'
import { auth, db, functions } from '@/lib/firebase/config'
import { formatCountdown } from '../runtime/cronSchedule'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { saveWorkflow } from '../persistence/workflowsApi'

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
  const [sched, setSched] = useState<ScheduleDoc | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [running, setRunning] = useState(false)

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
    setRunning(true)
    // Un run CLIENT resté « en cours » (isRunning) masque l'écho serveur sur les cartes
    // (garde dans hydrateServerRun). On le réinitialise : le run lancé ici est serveur,
    // sa progression doit s'afficher en direct via useServerRunLive.
    useRunContext.getState().resetRun()
    try {
      const { data } = await runNow({ workflowId })
      if (data.errorCount > 0) toast.warning(`Run serveur : ${data.nodeCount} node(s), ${data.errorCount} erreur(s).`)
      else toast.success(`Run serveur OK — ${data.nodeCount} node(s).`)
    } catch (e) {
      toast.error(`Run serveur échoué : ${e instanceof Error ? e.message : e}`)
    } finally { setRunning(false) }
  }

  // STOP : pose un flag d'abandon que l'executor serveur poll (abort sous ~3 s).
  const onStop = async () => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    try {
      await setDoc(doc(db, 'users', uid, 'workflowAbort', workflowId), { requested: true, ts: Date.now() })
      toast.info('Arrêt demandé — le run s’interrompra dans quelques secondes.')
    } catch (e) {
      toast.error(`Impossible de demander l’arrêt : ${e instanceof Error ? e.message : e}`)
    }
  }

  // SUSPENDRE LE FLUX : STOP n'arrête qu'UN run — le cron relance au tick suivant. Pour
  // vraiment arrêter le flux, on désactive le node Cron (enabled=false). `saveWorkflow`
  // resynchronise le planning : `findActiveCron` renvoie null → le doc workflowSchedules
  // est SUPPRIMÉ → le scanner ne reprend plus ce workflow. On abandonne aussi le run en
  // cours au passage (pour un arrêt immédiat et complet).
  const onSuspend = async () => {
    const uid = auth.currentUser?.uid
    const wf = useWorkflowStore.getState().current
    if (!uid || !wf) return
    const cronNode = wf.nodes.find((n) => n.type === 'cron' && (n.config as { enabled?: boolean })?.enabled)
    if (!cronNode) { toast.info('Aucun cron actif à suspendre.'); return }
    try {
      const nextNodes = wf.nodes.map((n) =>
        n.id === cronNode.id ? { ...n, config: { ...(n.config as object), enabled: false } } : n)
      const next = { ...wf, nodes: nextNodes }
      useWorkflowStore.getState().setNodes(nextNodes)
      await setDoc(doc(db, 'users', uid, 'workflowAbort', workflowId), { requested: true, ts: Date.now() }) // arrête un run en cours
      await saveWorkflow(uid, next) // supprime le planning → plus de relance
      toast.success('Flux suspendu — le cron ne relancera plus. Réactive « Planification active » dans le node Cron pour reprendre.')
    } catch (e) {
      toast.error(`Impossible de suspendre : ${e instanceof Error ? e.message : e}`)
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
        <span className="flex flex-col gap-0.5 leading-tight" title="Un run serveur est en cours d’exécution. Un workflow long avance par tranches : interrompu au budget, il REPREND automatiquement au tick suivant (checkpoint).">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <b className="text-emerald-300">En cours</b>
            {sched.lastRunAt && <span className="text-indigo-200/80">· démarré {hhmm(sched.lastRunAt)} (il y a {formatCountdown(now - sched.lastRunAt)})</span>}
          </span>
          {/* Pendant un run, nextRunAt = échéance du VERROU : l'heure à laquelle le
              scanner reprendra la main quoi qu'il arrive (fin, pause ou crash).
              Décompte LIVE (tick 1 s du panneau) pour voir l'échéance approcher. */}
          <span className="text-indigo-200/70 pl-3">
            reprise auto ≤ {hhmm(sched.nextRunAt)}{' '}
            {overdue ? '(imminente)' : <>(dans <span className="tabular-nums">{formatCountdown(sched.nextRunAt - now)}</span>)</>}
          </span>
        </span>
      ) : sched.cycleWaiting ? (
        // 2 lignes pour réduire la largeur : ligne 1 = état, ligne 2 = prochaine relance.
        <span className="flex flex-col gap-0.5 leading-tight" title="Cycle de moisson terminé à 100 % — relance à l'échéance calendaire">
          <b className="text-emerald-300">Cycle terminé ✓</b>
          <span className="text-indigo-200/70">
            Relance <b className="capitalize text-indigo-200">{dayTime(sched.nextRunAt)}</b>{' '}
            ({overdue ? 'imminente' : `dans ${formatCountdown(sched.nextRunAt - now)}`})
          </span>
        </span>
      ) : (
        // 2 lignes pour réduire la largeur : ligne 1 = dernier run, ligne 2 = prochain run.
        <span className="flex flex-col gap-0.5 leading-tight" title="Planification serveur active">
          <span>
            {sched.lastRunAt
              ? <>Dernier <b>{hhmm(sched.lastRunAt)}</b> <span className="text-indigo-200/70">(il y a {formatCountdown(now - sched.lastRunAt)})</span> {sched.lastStatus === 'error' ? <span className="text-rose-300 cursor-help" title={sched.lastError ?? 'Dernier run en erreur'}>⚠</span> : <span className="text-emerald-300">✓</span>}</>
              : <span className="text-indigo-200/70">Jamais exécuté</span>}
          </span>
          <span>Prochain <b>{hhmm(sched.nextRunAt)}</b> <span className="text-indigo-200/70">({overdue ? 'imminent' : `dans ${formatCountdown(sched.nextRunAt - now)}`})</span></span>
        </span>
      )}
      {isRunning ? (
        // STOP disponible pour TOUT run serveur en cours — lancé d'ici, par le cron, ou
        // depuis un autre poste (le flag d'abandon Firestore est lu par l'executor).
        <button
          onClick={onStop}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/25 hover:bg-red-500/40 text-red-200"
          title="Arrêter le run serveur EN COURS. ⚠ Le cron le relancera au prochain tick — utilise « Suspendre » pour arrêter le flux durablement."
        >
          <Square className="w-3 h-3" />
          STOP
          {running && <Loader2 className="w-3 h-3 animate-spin" />}
        </button>
      ) : (
        <button
          onClick={onRun}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/25 hover:bg-indigo-500/40"
          title="Exécuter maintenant côté serveur"
        >
          <Play className="w-3 h-3" />
          Lancer (serveur)
        </button>
      )}
      {/* SUSPENDRE : arrête le flux DURABLEMENT (désactive le cron) — toujours dispo tant
          que la planification est active, que le run soit en cours ou entre deux runs. */}
      <button
        onClick={onSuspend}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200"
        title="Suspendre le flux : désactive le cron (plus aucune relance) et arrête le run en cours. Réactivable dans le node Cron."
      >
        <PauseCircle className="w-3 h-3" />
        Suspendre
      </button>
      {/* Contrôles de run (Pas à pas / Run / Stop / Étape) intégrés DANS le bloc,
          séparés des actions serveur par un filet vertical. */}
      {children && <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/15">{children}</div>}
    </div>
  )
}
