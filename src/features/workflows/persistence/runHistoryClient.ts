// src/features/workflows/persistence/runHistoryClient.ts
// Persiste un SNAPSHOT durable d'un run CLIENT (éditeur) dans users/{uid}/workflowRuns —
// parité avec le serveur (functions/src/workflow/runHistory.ts) pour l'écran Résultats /
// l'historique. Non bloquant. Cap sheets ≤100 lignes + JSON-sanitize (les blobs d'images
// deviennent {} — l'upload Storage durable des assets reste à faire).
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { NodeRunState, NodeStatus, Workflow } from '../types'

const MAX_ROWS = 100
const MAX_RUNS = 20

export type RunStatus = 'success' | 'partial' | 'error'

function sanitize(outputs: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [id, ports] of Object.entries(outputs)) {
    const capped: Record<string, unknown> = {}
    for (const [port, val] of Object.entries(ports ?? {})) {
      if (val && typeof val === 'object' && Array.isArray((val as { rows?: unknown }).rows)) {
        const v = val as { rows: unknown[] }
        capped[port] = { ...(val as object), rows: v.rows.slice(0, MAX_ROWS) }
      } else {
        capped[port] = val
      }
    }
    out[id] = capped
  }
  try { return JSON.parse(JSON.stringify(out)) } catch { return {} }
}

export async function persistClientRun(
  uid: string,
  wf: Workflow,
  args: { startedAt: number; status: RunStatus; nodeStates: Record<string, NodeRunState> },
): Promise<void> {
  const nodeOutputs: Record<string, Record<string, unknown>> = {}
  const stateMap: Record<string, NodeStatus> = {}
  for (const [id, st] of Object.entries(args.nodeStates)) {
    stateMap[id] = st.status
    if (st.outputs && Object.keys(st.outputs).length > 0) nodeOutputs[id] = st.outputs
  }
  if (Object.keys(nodeOutputs).length === 0) return // rien à montrer

  try {
    await addDoc(collection(db, 'users', uid, 'workflowRuns'), {
      workflowId: wf.id, name: wf.name, trigger: 'manual',
      startedAt: args.startedAt, endedAt: Date.now(), status: args.status,
      nodeOutputs: sanitize(nodeOutputs), nodeStates: stateMap,
    })
    // Purge : ne garder que les MAX_RUNS plus récents.
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'workflowRuns'),
      where('workflowId', '==', wf.id), orderBy('endedAt', 'desc'),
    ))
    await Promise.all(snap.docs.slice(MAX_RUNS).map((d) => deleteDoc(d.ref).catch(() => {})))
  } catch (e) {
    console.warn('[runHistory] persistance du run client échouée :', e)
  }
}
