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
import { useEffect, useMemo, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { durationTrend, typicalDuration, type RunRow } from './runHistoryStats'
import { summarizeRuns, type RunHistorySummary } from '../dashboard/runHistorySummary'
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
  /** Ce qui a déclenché le run : le cron, un clic, un webhook… Persisté depuis toujours
   *  par les deux jumeaux, jamais montré — or « 4 s / Terminé » ne veut pas dire la même
   *  chose selon qu'il s'agit d'un passage planifié ou d'un essai lancé à la main. */
  trigger?: string
}

export interface RunHistoryView {
  runs: RunHistoryEntry[]
  /** Écart des durées récentes vs anciennes, en pourcentage. */
  trend: number | null
  /** Durée médiane des derniers runs — l'estimation que l'en-tête affiche. */
  typical: number | null
  /**
   * Bilan des issues (abouti / partiel / erreur, médiane, série d'échecs) — la MÊME
   * synthèse que le cockpit du tableau de bord, dérivée des runs DÉJÀ abonnés ici.
   *
   * ⚠ Surtout pas un second `onSnapshot` sur la même collection : `useWatchRunHistory`
   * interroge exactement cette requête pour le cockpit voisin, et l'écran « Suivi » lit
   * déjà la liste. Une fonction pure sur les documents en main coûte zéro lecture.
   */
  summary: RunHistorySummary
}

/** ⚠ Un seul appel par écran : l'en-tête ET l'historique lisent la même liste. Deux appels
 *  ouvriraient deux abonnements Firestore sur la même requête. */
export function useRunHistory(workflowId: string | null): RunHistoryView {
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
          startedAt: number; endedAt?: number; status?: string; trigger?: string
          nodeStates?: Record<string, NodeStatus>
        }
        const states = Object.values(data.nodeStates ?? {})
        return {
          id: d.id, startedAt: data.startedAt, endedAt: data.endedAt, status: data.status ?? 'success',
          nodesTotal: states.length, nodesError: states.filter((s) => s === 'error').length,
          // Cartes ABOUTIES : un run où tout a été sauté n'a rien fait, et ne doit peser
          // ni sur la durée typique ni sur la tendance (cf. `didWork`).
          succeeded: states.filter((s) => s === 'success').length,
          ...(data.trigger ? { trigger: data.trigger } : {}),
        }
      })),
      (e) => console.warn('[suivi] historique des runs illisible :', e),
    )
  }, [uid, workflowId])

  // ⚠ `endedAt` est optionnel sur l'entrée (le type le dit) mais jamais absent en pratique :
  // la requête trie dessus, donc Firestore écarte les runs qui ne le portent pas — un run EN
  // COURS n'est pas dans cette liste. Le bilan ne compte donc que des runs TERMINÉS, et le
  // repli à 0 est écarté par `summarizeRuns` lui-même.
  const summary = useMemo(
    () => summarizeRuns(runs.map((r) => ({ ...r, endedAt: r.endedAt ?? 0 })), RUN_HISTORY_PAGE),
    [runs],
  )

  return { runs, trend: durationTrend(runs), typical: typicalDuration(runs), summary }
}
