// functions/src/workflow/runLive.ts
// État LIVE du dernier run serveur d'un workflow, pour que le CLIENT (éditeur) puisse
// afficher la progression sur les cartes (sinon un run cron/serveur est invisible côté
// navigateur). Un doc par workflow (écrasé à chaque run) : users/{uid}/workflowRunsLive/{workflowId}.
import { getFirestore } from 'firebase-admin/firestore'
import type { RunLog } from './types'

export type LiveNodeStatus = 'running' | 'success' | 'error' | 'skipped' | 'pending'

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
}

/** Upsert (merge) le doc d'état live. Non bloquant : ne fait jamais échouer le run. */
export async function writeRunLive(uid: string, workflowId: string, data: Partial<RunLiveDoc>): Promise<void> {
  await getFirestore()
    .doc(`users/${uid}/workflowRunsLive/${workflowId}`)
    .set(data, { merge: true })
    .catch(() => {})
}
