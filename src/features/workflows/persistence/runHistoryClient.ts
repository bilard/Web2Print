// Persiste un SNAPSHOT durable d'un run CLIENT (éditeur) dans users/{uid}/workflowRuns —
// parité avec le serveur (functions/src/workflow/runHistory.ts) pour l'écran Résultats /
// l'historique. Non bloquant. Cap sheets ≤100 lignes + JSON-sanitize (les blobs d'images
// deviennent {} — l'upload Storage durable des assets reste à faire).
import { collection, addDoc, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore'
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
        // ⚠ `totalRows` accompagne l'échantillon : sans lui, une feuille de 115 815
        // lignes se relit comme « 100 lignes » et la volumétrie affichée ment.
        capped[port] = { ...(val as object), totalRows: v.rows.length, rows: v.rows.slice(0, MAX_ROWS) }
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
    // Purge : ne garder que les MAX_RUNS plus récents (tri client → pas d'index requis).
    const snap = await getDocs(query(collection(db, 'users', uid, 'workflowRuns'), where('workflowId', '==', wf.id)))
    const docs = snap.docs
      .map((d) => ({ ref: d.ref, endedAt: (d.data().endedAt as number) ?? 0 }))
      .sort((a, b) => b.endedAt - a.endedAt)
    await Promise.all(docs.slice(MAX_RUNS).map((d) => deleteDoc(d.ref).catch(() => {})))
  } catch (e) {
    console.warn('[runHistory] persistance du run client échouée :', e)
  }
}

/** Construit la map d'états attendue par `hydrateServerRun` à partir d'un doc de run durable
 *  (status par node + outputs par node). Pur → testable. Un node sans outputs garde son status. */
export function runDocToStates(
  nodeStates: Record<string, NodeStatus>,
  nodeOutputs: Record<string, Record<string, unknown>>,
): Record<string, { status: NodeStatus; outputs?: Record<string, unknown> }> {
  const states: Record<string, { status: NodeStatus; outputs?: Record<string, unknown> }> = {}
  for (const [id, status] of Object.entries(nodeStates ?? {})) {
    states[id] = { status, outputs: nodeOutputs?.[id] }
  }
  // Un node peut avoir des outputs sans entrée dans nodeStates (robustesse) → status « success ».
  for (const [id, outputs] of Object.entries(nodeOutputs ?? {})) {
    if (!states[id]) states[id] = { status: 'success', outputs }
  }
  return states
}

/** Charge le DERNIER run durable d'un workflow (toutes sources : client + serveur) pour
 *  réhydrater l'aperçu de l'éditeur après un rechargement de page. Renvoie les états par node
 *  + l'horodatage de fin (départage un éventuel écho serveur périmé). null si aucun run. */
export async function loadLatestRunStates(
  uid: string,
  workflowId: string,
): Promise<{ states: Record<string, { status: NodeStatus; outputs?: Record<string, unknown> }>; endedAt: number } | null> {
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'workflowRuns'), where('workflowId', '==', workflowId)))
    if (snap.empty) return null
    // Tri client par endedAt décroissant (pas d'index composite requis).
    const latest = snap.docs
      .map((d) => d.data())
      .sort((a, b) => ((b.endedAt as number) ?? 0) - ((a.endedAt as number) ?? 0))[0]
    if (!latest) return null
    const states = runDocToStates(
      (latest.nodeStates ?? {}) as Record<string, NodeStatus>,
      (latest.nodeOutputs ?? {}) as Record<string, Record<string, unknown>>,
    )
    if (Object.keys(states).length === 0) return null
    return { states, endedAt: (latest.endedAt as number) ?? 0 }
  } catch (e) {
    console.warn('[runHistory] chargement du dernier run échoué :', e)
    return null
  }
}

/** Supprime un run d'historique (irréversible). */
export async function deleteRun(uid: string, runId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'workflowRuns', runId))
}

/** Supprime TOUT l'historique d'un workflow (irréversible). Retourne le nb supprimé. */
export async function deleteAllRuns(uid: string, workflowId: string): Promise<number> {
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'workflowRuns'), where('workflowId', '==', workflowId),
  ))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})))
  return snap.size
}
