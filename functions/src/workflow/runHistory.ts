// functions/src/workflow/runHistory.ts
import { getFirestore } from 'firebase-admin/firestore'
import type { HeadlessResult } from './execute'

const MAX_LOGS = 200
const MAX_ROWS = 100
const MAX_RUNS = 20

/** Plafonne les sheets (≤100 lignes) + JSON-sanitize (retire undefined/non-sérialisable). */
function capOutputs(outputs: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [nodeId, ports] of Object.entries(outputs ?? {})) {
    const capped: Record<string, unknown> = {}
    for (const [port, val] of Object.entries(ports ?? {})) {
      if (val && typeof val === 'object' && Array.isArray((val as { rows?: unknown }).rows)) {
        const v = val as { rows: unknown[] }
        capped[port] = { ...(val as object), rows: v.rows.slice(0, MAX_ROWS) }
      } else {
        capped[port] = val
      }
    }
    out[nodeId] = capped
  }
  try { return JSON.parse(JSON.stringify(out)) } catch { return {} }
}

/** Conserve les MAX_RUNS runs les plus récents d'un workflow, supprime les plus anciens. */
async function prune(uid: string, workflowId: string): Promise<void> {
  const snap = await getFirestore()
    .collection('users').doc(uid).collection('workflowRuns')
    .where('workflowId', '==', workflowId).orderBy('endedAt', 'desc').offset(MAX_RUNS).get()
  await Promise.all(snap.docs.map((d) => d.ref.delete().catch(() => {})))
}

export async function writeRunHistory(
  uid: string,
  meta: { workflowId: string; name: string; trigger: 'cron' | 'manual' | 'webhook' | 'telegram'; startedAt: number },
  result: HeadlessResult,
): Promise<void> {
  const logs = result.logs.slice(-MAX_LOGS)
  await getFirestore().collection('users').doc(uid).collection('workflowRuns').add({
    workflowId: meta.workflowId, name: meta.name, trigger: meta.trigger,
    startedAt: meta.startedAt, endedAt: Date.now(),
    status: result.status, nodeCount: result.nodeCount, errorCount: result.errorCount, logs,
    // Snapshot de résultat (écran Résultats / historique) : sorties cappées + états par node.
    nodeOutputs: capOutputs(result.nodeOutputs), nodeStates: result.nodeStates,
  })
  await prune(uid, meta.workflowId).catch(() => {})
}
