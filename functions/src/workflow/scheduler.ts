// functions/src/workflow/scheduler.ts
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { executeWorkflowHeadless } from './execute'
import { writeRunHistory } from './runHistory'
import { computeNextRun, type CronConfig } from './cronSchedule'
import type { ServerWorkflow } from './types'
import './nodes/index' // enregistre les nodes (effet de bord)

if (!getApps().length) initializeApp()

async function loadWorkflow(uid: string, workflowId: string): Promise<ServerWorkflow | null> {
  const snap = await getFirestore().doc(`users/${uid}/workflows/${workflowId}`).get()
  if (!snap.exists) return null
  const d = snap.data() as { name?: string; nodes?: unknown; edges?: unknown }
  return {
    id: workflowId, name: d.name ?? workflowId, ownerId: uid,
    nodes: (d.nodes ?? []) as ServerWorkflow['nodes'], edges: (d.edges ?? []) as ServerWorkflow['edges'],
  }
}

async function runOne(uid: string, workflowId: string, trigger: 'cron' | 'manual') {
  const wf = await loadWorkflow(uid, workflowId)
  if (!wf) throw new Error('Workflow introuvable.')
  const startedAt = Date.now()
  const ac = new AbortController()
  const result = await executeWorkflowHeadless(wf, { uid, signal: ac.signal })
  await writeRunHistory(uid, { workflowId, name: wf.name, trigger, startedAt }, result)
  return result
}

// Scanner : toutes les 10 min, exécute les plannings dûs.
export const workflowCronScheduler = onSchedule(
  { schedule: 'every 10 minutes', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const db = getFirestore()
    const now = Date.now()
    const due = await db.collection('workflowSchedules')
      .where('enabled', '==', true).where('nextRunAt', '<=', now).get()
    for (const docSnap of due.docs) {
      const s = docSnap.data() as { uid: string; workflowId: string; every: number; unit: CronConfig['unit'] }
      try {
        const result = await runOne(s.uid, s.workflowId, 'cron')
        await docSnap.ref.update({
          lastRunAt: now, lastStatus: result.status,
          nextRunAt: computeNextRun({ enabled: true, every: s.every, unit: s.unit }, now),
        })
      } catch (err) {
        await docSnap.ref.update({
          lastRunAt: now, lastStatus: 'error',
          nextRunAt: computeNextRun({ enabled: true, every: s.every, unit: s.unit }, now),
        })
        console.error('workflowCronScheduler: échec', s.workflowId, err)
      }
    }
  },
)

// Callable : exécution immédiate (bouton « Lancer maintenant (serveur) »).
export const runWorkflowNow = onCall(
  { region: 'europe-west1', timeoutSeconds: 300, memory: '512MiB' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.')
    const workflowId = String((req.data as { workflowId?: string })?.workflowId ?? '')
    if (!workflowId) throw new HttpsError('invalid-argument', 'workflowId requis.')
    const result = await runOne(uid, workflowId, 'manual')
    return { status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount }
  },
)
