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
import { computeNextRun, type CronConfig } from './cronSchedule'
import type { ServerWorkflow } from './types'
import './nodes/index' // enregistre les nodes (effet de bord)

if (!getApps().length) initializeApp()

/** Borne de temps par exécution de workflow : déclenche l'AbortSignal que les nodes
 * (réseau, boucles) surveillent, pour éviter qu'un workflow emballé épuise le budget
 * de la Function et affame les autres plannings dûs. Doit rester < timeoutSeconds des
 * deux Functions (540s). Relevé à 500s : l'escalade Bright Data (jusqu'à 160s/URL) sur
 * un site dur (Leroy Merlin) + plusieurs pages liste dépassait l'ancien budget de 240s. */
const RUN_TIMEOUT_MS = 500_000
/** Plafond de plannings traités par tick du scanner (les autres repassent au tick suivant,
 * ordonnés par échéance). Évite qu'un lot massif fasse expirer toute la Function. */
const MAX_SCHEDULES_PER_TICK = 25

/** Types de nodes RÉ-EXÉCUTABLES sans risque même interrompus en plein vol : lecture/
 *  transformation pure, aucun effet de bord externe. La reprise ne saute QUE les nodes
 *  déjà terminés ; si un node NON terminé d'un autre type (gsheets-export, send-gmail,
 *  send-telegram, webhook-post, save-pim…) avait DÉMARRÉ, le ré-exécuter risque des
 *  doublons → on refuse la reprise (cf. garde dans runWorkflow). */
const RESUMABLE_STRADDLE = new Set<string>([
  'list-products', 'scrape-url', 'web-scraping', 'web-search', 'enrichment', 'compare-prices',
  'transform-filter', 'transform-rename', 'transform-set-fields', 'transform-sort', 'transform-text',
  'if-else', 'pipe', 'text-input',
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
      await saveCheckpointMeta(uid, wf.id, { runId, startedAt, attempts: attempts + 1 })
      // Aperçu en pause : les nodes faits = success, le reste = pending (reprise au tick suivant).
      const pausedStates: Record<string, 'success' | 'pending'> = {}
      for (const n of wf.nodes) pausedStates[n.id] = completed.has(n.id) ? 'success' : 'pending'
      await writeRunLive(uid, wf.id, {
        runId, trigger, startedAt, status: 'running', nodeStates: pausedStates,
        logs: result.logs.slice(-200), nodeOutputs: capOutputsForPreview(result.nodeOutputs),
        nodeConnectors: result.nodeConnectors,
      })
      return { ...result, paused: true }
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
    return { ...result, paused: false }
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

// Scanner : toutes les minutes, exécute les plannings dûs (et purge les orphelins).
export const workflowCronScheduler = onSchedule(
  { schedule: 'every 1 minutes', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const due = await db.collection('workflowSchedules')
      .where('enabled', '==', true).where('nextRunAt', '<=', now)
      .orderBy('nextRunAt', 'asc').limit(MAX_SCHEDULES_PER_TICK).get()
    for (const docSnap of due.docs) {
      const s = docSnap.data() as {
        uid: string; workflowId: string; every: number; unit: CronConfig['unit']
        atTime?: string | null; weekday?: number | null; afterCompletion?: boolean
      }
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
      try {
        const result = await runWorkflow(wf, s.uid, 'cron')
        // Mode « après la fin » : ancrer la prochaine échéance sur la FIN du run (Date.now()
        // ici = après le await), pas sur le début du tick → ni chevauchement, ni temps mort.
        const anchor = cron.afterCompletion ? Date.now() : now
        // Run en pause (timeout reprenable) : on reprogramme AU PLUS TÔT (prochain tick)
        // pour reprendre là où on s'est arrêté, sans avancer à la prochaine échéance.
        const nextRunAt = result.paused ? now : computeNextRun(cron, anchor)
        const lastStatus = result.paused ? 'running' : result.status
        await docSnap.ref.update({ lastRunAt: now, lastStatus, nextRunAt })
      } catch (err) {
        await docSnap.ref.update({ lastRunAt: now, lastStatus: 'error', nextRunAt: computeNextRun(cron, cron.afterCompletion ? Date.now() : now) })
        console.error('workflowCronScheduler: échec', s.workflowId, err)
      }
    }
  },
)

// Callable : exécution immédiate (bouton « Lancer maintenant (serveur) »).
export const runWorkflowNow = onCall(
  { region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const workflowId = String((req.data as { workflowId?: string })?.workflowId ?? '')
    if (!workflowId) throw new HttpsError('invalid-argument', 'workflowId requis.')
    const result = await runOne(uid, workflowId, 'manual')
    return { status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount }
  },
)
