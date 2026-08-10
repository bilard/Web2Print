// Historique des runs d'un workflow — les vingt derniers, triés par fin.
//
// ⚠ Les runs NAVIGATEUR sont déjà dans cet historique : `persistClientRun`
// (workflows/persistence/runHistoryClient.ts, appelé en fin d'`executeWorkflow`) y écrit un
// snapshot durable depuis toujours, comme le jumeau serveur (`writeRunHistory`). Rien à
// publier ici, seulement à lire.
//
// ⚠ Index Firestore composite requis (égalité `workflowId` + tri `endedAt`) — déjà déclaré
// dans `firestore.indexes.json` pour la purge serveur (`prune()` dans
// `functions/src/workflow/runHistory.ts`), qui interroge exactement la même forme. Rien à
// ajouter côté index.
import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { durationTrend, type RunRow } from './runHistoryStats'
import type { NodeStatus } from '../../workflows/types'

/** Nombre de runs conservés à l'écriture (cf. `MAX_RUNS` des deux jumeaux) — même page ici. */
const RUN_HISTORY_PAGE = 20

export interface RunHistoryEntry extends RunRow {
  id: string
  status: string
  /** Cartes ayant un état dans le doc du run — mesure honnête commune aux deux jumeaux
   *  (le client n'écrit ni `nodeCount` ni `errorCount`, seul `nodeStates` existe des deux
   *  côtés). */
  nodesTotal: number
  nodesError: number
}

export function useRunHistory(workflowId: string | null): { runs: RunHistoryEntry[]; trend: number | null } {
  const uid = useWorkspaceUid()
  const [runs, setRuns] = useState<RunHistoryEntry[]>([])

  useEffect(() => {
    if (!uid || !workflowId) { setRuns([]); return }
    return onSnapshot(
      query(
        collection(db, 'users', uid, 'workflowRuns'),
        where('workflowId', '==', workflowId), orderBy('endedAt', 'desc'), limit(RUN_HISTORY_PAGE),
      ),
      (snap) => setRuns(snap.docs.map((d) => {
        const data = d.data() as {
          startedAt: number; endedAt?: number; status?: string
          nodeStates?: Record<string, NodeStatus>
        }
        const states = Object.values(data.nodeStates ?? {})
        return {
          id: d.id, startedAt: data.startedAt, endedAt: data.endedAt, status: data.status ?? 'success',
          nodesTotal: states.length, nodesError: states.filter((s) => s === 'error').length,
        }
      })),
      (e) => console.warn('[suivi] historique des runs illisible :', e),
    )
  }, [uid, workflowId])

  return { runs, trend: durationTrend(runs) }
}
