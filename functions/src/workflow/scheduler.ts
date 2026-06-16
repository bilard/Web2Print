// functions/src/workflow/scheduler.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from './execute'
import { writeRunHistory } from './runHistory'
import { writeRunLive } from './runLive'
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
 *  Firestore (1 Mo/doc). 100 lignes/sheet suffisent pour un aperçu. */
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

/** Exécute un workflow déjà chargé (boucle d'abort + historique + état live). */
async function runWorkflow(wf: ServerWorkflow, uid: string, trigger: 'cron' | 'manual' | 'webhook') {
  const startedAt = Date.now()
  const runId = `srv_${startedAt}`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), RUN_TIMEOUT_MS)
  // État live initial : toutes les cartes « en attente » (gris). La progression
  // node-par-node (onProgress) les fait passer running → success/error au fil du run.
  const initial: Record<string, 'pending'> = {}
  for (const n of wf.nodes) initial[n.id] = 'pending'
  await writeRunLive(uid, wf.id, { runId, trigger, startedAt, status: 'running', nodeStates: initial, logs: [] })
  try {
    const result = await executeWorkflowHeadless(wf, {
      uid,
      signal: ac.signal,
      onProgress: (nodeStates) => writeRunLive(uid, wf.id, { nodeStates }),
    })
    await writeRunHistory(uid, { workflowId: wf.id, name: wf.name, trigger, startedAt }, result)
    await writeRunLive(uid, wf.id, {
      runId, trigger, startedAt, endedAt: Date.now(),
      status: result.status, nodeStates: result.nodeStates, logs: result.logs.slice(-200),
      nodeOutputs: capOutputsForPreview(result.nodeOutputs),
      nodeConnectors: result.nodeConnectors,
    })
    return result
  } catch (err) {
    await writeRunLive(uid, wf.id, { runId, endedAt: Date.now(), status: 'error' })
    throw err
  } finally {
    clearTimeout(timer)
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
        atTime?: string | null; weekday?: number | null
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
      }
      try {
        const result = await runWorkflow(wf, s.uid, 'cron')
        await docSnap.ref.update({ lastRunAt: now, lastStatus: result.status, nextRunAt: computeNextRun(cron, now) })
      } catch (err) {
        await docSnap.ref.update({ lastRunAt: now, lastStatus: 'error', nextRunAt: computeNextRun(cron, now) })
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
