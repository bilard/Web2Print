// functions/src/workflow/runLive.ts
// État LIVE du dernier run serveur d'un workflow, pour que le CLIENT (éditeur) puisse
// afficher la progression sur les cartes (sinon un run cron/serveur est invisible côté
// navigateur). Un doc par workflow (écrasé à chaque run) : users/{uid}/workflowRunsLive/{workflowId}.
import { getFirestore } from 'firebase-admin/firestore'
import type { RunLog } from './types'

type LiveNodeStatus = 'running' | 'success' | 'error' | 'skipped' | 'pending'

export interface RunLiveDoc {
  runId: string
  trigger: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'success' | 'partial' | 'error'
  nodeStates: Record<string, LiveNodeStatus>
  logs: RunLog[]
  /** Sorties par node (sheets tronquées) pour l'aperçu données côté client. */
  nodeOutputs?: Record<string, Record<string, unknown>>
  /** Connecteurs réellement utilisés par node (badges sur les cartes). */
  nodeConnectors?: Record<string, string[]>
}

/** Upsert (merge) le doc d'état live. Non bloquant : ne fait jamais échouer le run. */
export async function writeRunLive(uid: string, workflowId: string, data: Partial<RunLiveDoc>): Promise<void> {
  await getFirestore()
    .doc(`users/${uid}/workflowRunsLive/${workflowId}`)
    .set(data, { merge: true })
    .catch(() => {})
}

/** Ajoute une ligne d'ERREUR aux logs live SANS écraser l'historique du run (arrayUnion).
 *  Sans elle, un crash de run ne laissait qu'un `status: 'error'` muet — introuvable
 *  depuis l'app (« dernier run en erreur » sans aucun détail). */
export async function appendRunLiveError(uid: string, workflowId: string, msg: string): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore')
  await getFirestore()
    .doc(`users/${uid}/workflowRunsLive/${workflowId}`)
    .set({ logs: FieldValue.arrayUnion({ ts: Date.now(), level: 'error', msg: msg.slice(0, 600) }) }, { merge: true })
    .catch(() => {})
}
