// functions/src/workflow/scheduler.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from './execute'
import { writeRunHistory } from './runHistory'
import { writeRunLive } from './runLive'
import {
  loadCheckpoint, saveNodeOutput, saveCheckpointMeta, clearCheckpoint, MAX_RESUME_ATTEMPTS,
} from './checkpoint'
import { computeNextRun, computeNextCycleRun, sanitizeCycle, type CronConfig } from './cronSchedule'
import type { ServerWorkflow } from './types'
import './nodes/index' // enregistre les nodes (effet de bord)

if (!getApps().length) initializeApp()

/** Borne de temps par exécution de workflow : déclenche l'AbortSignal que les nodes
 * (réseau, boucles) surveillent, pour éviter qu'un workflow emballé épuise le budget
 * de la Function et affame les autres plannings dûs. Doit rester < timeoutSeconds des
 * deux Functions (1800s). Relevé à 1700s : une moisson à gros budget de pages (ex. F1 :
 * 1000 pages × 17 sites) + le Comparer dépassaient les 500s → run « interrompu » avant
 * l'écriture du rapport (dashboard figé). Le vrai plafond reste le timeout de la Function. */
const RUN_TIMEOUT_MS = 1_700_000
/** Plafond de plannings traités par tick du scanner (les autres repassent au tick suivant,
 * ordonnés par échéance). Évite qu'un lot massif fasse expirer toute la Function. */
const MAX_SCHEDULES_PER_TICK = 25

/** Fenêtre de fin de run RÉSERVÉE aux nodes AVAL (Comparer catalogue, exports) : les
 * nodes à curseur (moisson, recherche dirigée) rendent la main à RUN_TIMEOUT − RESERVE.
 * Sans elle, la moisson consommait tout le budget à chaque run et le comparatif —
 * dernier du graphe — était interrompu systématiquement (dashboard jamais rafraîchi). */
const DOWNSTREAM_RESERVE_MS = 600_000

/** Types de nodes RÉ-EXÉCUTABLES sans risque même interrompus en plein vol : lecture/
 *  transformation pure, aucun effet de bord externe. La reprise ne saute QUE les nodes
 *  déjà terminés ; si un node NON terminé d'un autre type (gsheets-export, send-gmail,
 *  send-telegram, webhook-post, save-pim…) avait DÉMARRÉ, le ré-exécuter risque des
 *  doublons → on refuse la reprise (cf. garde dans runWorkflow). */
const RESUMABLE_STRADDLE = new Set<string>([
  'list-products', 'scrape-url', 'web-scraping', 'web-search', 'enrichment', 'compare-prices',
  'transform-filter', 'transform-rename', 'transform-set-fields', 'transform-sort', 'transform-text',
  'if-else', 'pipe', 'text-input',
  // Veille tarifaire : avancement par CURSEUR persisté (savePage/saveCursor réécrivent les
  // mêmes docs) ou lecture pure — la ré-exécution après interruption ne doublonne rien.
  // Sans eux, un timeout en pleine moisson (fréquent : 19 sites) rendait la reprise
  // impossible → le run repartait de zéro à chaque tick (« le cron s'arrête au 1ᵉʳ run »).
  'harvest-competitor', 'compare-catalog', 'source-sites', 'directed-search', 'gsheets-import',
])

async function loadWorkflow(uid: string, workflowId: string): Promise<ServerWorkflow | null> {
  const snap = await getFirestore().doc(`users/${uid}/workflows/${workflowId}`).get()
  if (!snap.exists) return null
  const d = snap.data() as { name?: string; nodes?: unknown; edges?: unknown }
  return {
    id: workflowId, name: d.name ?? workflowId, ownerId: uid,
    nodes: (d.nodes ?? []) as ServerWorkflow['nodes'], edges: (d.edges ?? []) as ServerWorkflow['edges'],
  }
}

/** Tronque les rows des sheets de sortie (aperçu client) pour tenir sous le quota
 *  Firestore (1 Mo/doc). 100 lignes/sheet suffisent pour un aperçu.
 *  ⚠️ Ne cape QUE les `.rows`. Un port `file` (ServerFile base64, ex : cost-report)
 *  passe tel quel — OK tant que les fichiers restent petits (rapport HTML ~dizaines de
 *  Ko) ; à tronquer/omettre ici si un node émet un gros binaire (PDF, image). */
function capOutputsForPreview(outputs: Record<string, Record<string, unknown>>, maxRows = 100): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, ports] of Object.entries(outputs)) {
    const p2: Record<string, unknown> = {}
    for (const [port, val] of Object.entries(ports)) {
      if (val && typeof val === 'object' && Array.isArray((val as { rows?: unknown[] }).rows)) {
        const sheet = val as { rows: unknown[] }
        p2[port] = { ...sheet, rows: sheet.rows.slice(0, maxRows) }
      } else {
        p2[port] = val
      }
    }
    out[id] = p2
  }
  return out
}

/** Exécute un workflow déjà chargé (boucle d'abort + historique + état live + reprise). */
async function runWorkflow(wf: ServerWorkflow, uid: string, trigger: 'cron' | 'manual' | 'webhook') {
  // Reprise (cron uniquement — seul le scanner peut re-déclencher au tick suivant) : si un
  // run précédent a expiré, on repart de ses sorties au lieu de tout refaire.
  const prior = trigger === 'cron' ? await loadCheckpoint(uid, wf.id) : null
  const startedAt = prior?.startedAt ?? Date.now() // start LOGIQUE (continuité d'affichage + expiration)
  const runId = prior?.runId ?? `srv_${startedAt}`
  const attempts = prior?.attempts ?? 0
  const priorDone = prior ? Object.keys(prior.outputs).length : 0
  const completed = new Set<string>(prior ? Object.keys(prior.outputs) : [])

  // Distingue l'abort par TIMEOUT (reprenable) du STOP volontaire (on n'enchaîne pas).
  let abortReason: 'timeout' | 'stop' | null = null
  const ac = new AbortController()
  const timer = setTimeout(() => { if (!abortReason) abortReason = 'timeout'; ac.abort() }, RUN_TIMEOUT_MS)
  // Bouton STOP : le client pose users/{uid}/workflowAbort/{wf.id} ; on purge un flag
  // périmé au départ, puis on le poll pour déclencher l'abort en cours de run.
  const abortRef = getFirestore().doc(`users/${uid}/workflowAbort/${wf.id}`)
  await abortRef.delete().catch(() => {})
  const abortPoll = setInterval(() => {
    abortRef.get().then((s) => { if (s.exists && s.data()?.requested) { abortReason = 'stop'; ac.abort() } }).catch(() => {})
  }, 3000)
  // État live initial. Sur reprise : on NE réinitialise PAS l'aperçu (les sorties déjà
  // calculées restent visibles) ; sinon reset complet (nouveau runId, aperçu vidé).
  if (prior) {
    await writeRunLive(uid, wf.id, { status: 'running' })
  } else {
    const initial: Record<string, 'pending'> = {}
    for (const n of wf.nodes) initial[n.id] = 'pending'
    await writeRunLive(uid, wf.id, {
      runId, trigger, startedAt, status: 'running', nodeStates: initial, logs: [],
      nodeOutputs: {}, nodeConnectors: {},
    })
  }
  try {
    // Streaming des logs : écriture throttlée (≥ 2 s) pour que l'onglet Logs se
    // remplisse PENDANT le run (sinon « En cours… Aucun log » jusqu'à la fin).
    let lastLogWrite = 0
    const result = await executeWorkflowHeadless(wf, {
      uid,
      signal: ac.signal,
      // Échéance de restitution des nodes à curseur : ancrée sur CE tick (pas sur le
      // startedAt logique d'une série de reprises — chaque tranche a sa pleine fenêtre).
      deadlineAt: Date.now() + RUN_TIMEOUT_MS - DOWNSTREAM_RESERVE_MS,
      resume: prior ? { outputs: prior.outputs } : undefined,
      // Checkpoint cron : persiste chaque sortie de node dès qu'il réussit. On ne le
      // compte « repris » que si la persistance a RÉELLEMENT eu lieu (pas un node trop gros).
      onNodeDone: trigger === 'cron'
        ? async (nodeId, output) => { if (await saveNodeOutput(uid, wf.id, nodeId, output)) completed.add(nodeId) }
        : undefined,
      onProgress: (nodeStates, nodeOutputs) =>
        writeRunLive(uid, wf.id, { nodeStates, nodeOutputs: capOutputsForPreview(nodeOutputs) }),
      onLog: (logs) => {
        const now = Date.now()
        if (now - lastLogWrite < 2000) return
        lastLogWrite = now
        void writeRunLive(uid, wf.id, { logs: logs.slice(-200) })
      },
    })

    // Fin de cycle : signalée ce tick, OU lors d'une tranche précédente du même run
    // (le node signaleur, déjà checkpointé, n'est pas ré-exécuté à la reprise).
    const cycleComplete = result.cycleComplete || !!prior?.cycleComplete

    // Garde d'idempotence : un node à effet de bord DÉMARRÉ mais non terminé serait
    // ré-exécuté en entier à la reprise (doublons Sheets/mail/webhook). On ne reprend que
    // si tout node straddlé est d'un type pur ré-exécutable.
    const typeById = new Map(wf.nodes.map((n) => [n.id, n.type]))
    const unsafeStraddle = result.startedNodes.some(
      (id) => !completed.has(id) && !RESUMABLE_STRADDLE.has(typeById.get(id) ?? ''),
    )
    // Reprenable : timeout cron, run non abouti, progrès réel ce tick, budget restant,
    // et aucun node à effet de bord interrompu en plein vol.
    const canResume = trigger === 'cron' && abortReason === 'timeout' && ac.signal.aborted
      && completed.size > priorDone && attempts + 1 < MAX_RESUME_ATTEMPTS && !unsafeStraddle
    if (canResume) {
      await saveCheckpointMeta(uid, wf.id, { runId, startedAt, attempts: attempts + 1, cycleComplete })
      // Aperçu en pause : les nodes faits = success, le reste = pending (reprise au tick suivant).
      const pausedStates: Record<string, 'success' | 'pending'> = {}
      for (const n of wf.nodes) pausedStates[n.id] = completed.has(n.id) ? 'success' : 'pending'
      await writeRunLive(uid, wf.id, {
        runId, trigger, startedAt, status: 'running', nodeStates: pausedStates,
        logs: result.logs.slice(-200), nodeOutputs: capOutputsForPreview(result.nodeOutputs),
        nodeConnectors: result.nodeConnectors,
      })
      return { ...result, cycleComplete, paused: true }
    }

    // Sinon, run terminé : succès/partiel, STOP volontaire, ou reprise impossible/épuisée.
    if (trigger === 'cron') await clearCheckpoint(uid, wf.id)
    // Run interrompu (STOP/timeout non reprenable) : statut global « error » (n'a pas abouti),
    // même si les nodes individuels sont « arrêtés » (skipped) et non en échec.
    const finalStatus = ac.signal.aborted ? 'error' : result.status
    await writeRunHistory(uid, { workflowId: wf.id, name: wf.name, trigger, startedAt }, { ...result, status: finalStatus })
    await writeRunLive(uid, wf.id, {
      runId, trigger, startedAt, endedAt: Date.now(),
      status: finalStatus, nodeStates: result.nodeStates, logs: result.logs.slice(-200),
      nodeOutputs: capOutputsForPreview(result.nodeOutputs),
      nodeConnectors: result.nodeConnectors,
    })
    return { ...result, cycleComplete, paused: false }
  } catch (err) {
    if (trigger === 'cron') await clearCheckpoint(uid, wf.id).catch(() => {})
    await writeRunLive(uid, wf.id, { runId, endedAt: Date.now(), status: 'error' })
    throw err
  } finally {
    clearTimeout(timer)
    clearInterval(abortPoll)
    await abortRef.delete().catch(() => {})
  }
}

export async function runOne(uid: string, workflowId: string, trigger: 'cron' | 'manual' | 'webhook') {
  const wf = await loadWorkflow(uid, workflowId)
  if (!wf) throw new Error('Workflow introuvable.')
  return runWorkflow(wf, uid, trigger)
}

/** Forme du doc `workflowSchedules/{workflowId}` lue par le scanner. */
interface ScheduleDocData {
  uid: string; workflowId: string; every: number; unit: CronConfig['unit']
  atTime?: string | null; weekday?: number | null; afterCompletion?: boolean
  cycle?: unknown
}

/**
 * Champs de planning à écrire APRÈS un run. Trois issues :
 *  - run en pause (timeout reprenable) → reprise au plus tôt (prochain tick) ;
 *  - cycle de moisson terminé à 100 % ET relance calendaire configurée → prochaine
 *    échéance du calendrier (`cycleWaiting` affiché côté client) ; dates précises
 *    épuisées → la planification se désactive proprement ;
 *  - sinon → cadence normale (ancrée fin de run en mode « après la fin »).
 */
function afterRunPatch(
  s: ScheduleDocData,
  result: { paused: boolean; cycleComplete: boolean; status: string },
  tickStart: number,
): Record<string, unknown> {
  const lastStatus = result.paused ? 'running' : result.status
  if (result.paused) return { lastStatus, nextRunAt: Date.now() + 5_000 }
  const cycle = sanitizeCycle(s.cycle)
  if (cycle && result.cycleComplete) {
    const next = computeNextCycleRun(cycle, Date.now())
    if (next == null) return { lastStatus: 'done', enabled: false, cycleWaiting: false }
    return { lastStatus, nextRunAt: next, cycleWaiting: true }
  }
  const cron: CronConfig = {
    enabled: true, every: s.every, unit: s.unit,
    atTime: s.atTime ?? undefined, weekday: s.weekday ?? undefined,
    afterCompletion: !!s.afterCompletion,
  }
  const anchor = cron.afterCompletion ? Date.now() : tickStart
  return { lastStatus, nextRunAt: computeNextRun(cron, anchor), cycleWaiting: false }
}

// Scanner : toutes les minutes, exécute les plannings dûs (et purge les orphelins).
export const workflowCronScheduler = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west1', timeoutSeconds: 1800, memory: '1GiB' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const due = await db.collection('workflowSchedules')
      .where('enabled', '==', true).where('nextRunAt', '<=', now)
      .orderBy('nextRunAt', 'asc').limit(MAX_SCHEDULES_PER_TICK).get()
    for (const docSnap of due.docs) {
      const s = docSnap.data() as ScheduleDocData
      // Planning orphelin : le workflow a été supprimé sans nettoyer son cron.
      // On purge le doc pour arrêter la boucle d'échec (sinon réessai chaque minute
      // à l'infini, jamais de run réel). Le client purge aussi à la suppression.
      const wf = await loadWorkflow(s.uid, s.workflowId)
      if (!wf) {
        await docSnap.ref.delete().catch(() => {})
        console.warn('workflowCronScheduler: planning orphelin purgé', s.workflowId)
        continue
      }
      const cron: CronConfig = {
        enabled: true, every: s.every, unit: s.unit,
        atTime: s.atTime ?? undefined, weekday: s.weekday ?? undefined,
        afterCompletion: !!s.afterCompletion,
      }
      // VERROU anti-chevauchement, posé AVANT le run : on repousse nextRunAt au-delà du
      // budget de run et on marque 'running'. Sans ça, chaque tick (1×/min) relancerait le
      // même workflow pendant qu'il tourne encore (moisson longue) → empilement de runs et
      // planning jamais avancé (dashboard figé). `lastRunAt = now` = DÉBUT du run (affiché).
      // Si le process meurt en cours, le verrou expire seul (nextRunAt ~30 min → reprise auto).
      await docSnap.ref.update({ lastRunAt: now, lastStatus: 'running', nextRunAt: now + RUN_TIMEOUT_MS + 120_000 })
      try {
        const result = await runWorkflow(wf, s.uid, 'cron')
        await docSnap.ref.update(afterRunPatch(s, result, now))
      } catch (err) {
        await docSnap.ref.update({ lastStatus: 'error', nextRunAt: computeNextRun(cron, cron.afterCompletion ? Date.now() : now) })
        console.error('workflowCronScheduler: échec', s.workflowId, err)
      }
    }
  },
)

// Callable : exécution immédiate (bouton « Lancer maintenant (serveur) »).
export const runWorkflowNow = onCall(
  { region: 'europe-west1', timeoutSeconds: 1800, memory: '1GiB' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const workflowId = String((req.data as { workflowId?: string })?.workflowId ?? '')
    if (!workflowId) throw new HttpsError('invalid-argument', 'workflowId requis.')
    const startedAt = Date.now()
    const result = await runOne(uid, workflowId, 'manual')
    // Resynchroniser le planning : un run manuel peut TERMINER le cycle (→ attendre
    // l'échéance calendaire) ou le RELANCER pendant l'attente (→ reprendre la cadence).
    const ref = getFirestore().doc(`workflowSchedules/${workflowId}`)
    const sched = await ref.get().catch(() => null)
    const s = sched?.exists ? (sched.data() as ScheduleDocData & { enabled?: boolean }) : null
    if (s?.enabled && s.uid === uid) await ref.update(afterRunPatch(s, result, startedAt)).catch(() => {})
    return { status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount }
  },
)
