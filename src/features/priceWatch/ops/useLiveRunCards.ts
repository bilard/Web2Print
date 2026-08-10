// Cartes du run EN DIRECT pour un workflow, lues hors éditeur.
//
// ⚠ Même calcul que la bande d'avancement de l'éditeur (`runProgress`), mais SANS toucher
// au store global `useRunContext` : celui-ci ne représente que le workflow OUVERT dans
// l'éditeur (un seul à la fois) — pas nécessairement celui de ce suivi. On lit le doc live
// en lecture seule et on calcule localement, à côté.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { getWorkflow } from '../../workflows/persistence/workflowsApi'
import { nodeRegistry } from '../../workflows/registry'
import { runProgress, type RunProgress } from '../../workflows/runtime/runProgress'
import type { Workflow, NodeRunState, NodeStatus } from '../../workflows/types'
import { useTranslation } from '@/lib/i18n'

interface RunLiveDoc {
  startedAt?: number
  nodeStates?: Record<string, NodeStatus>
  nodeCounts?: Record<string, number>
  nodeCycles?: Record<string, number>
}

/** États des cartes reconstruits depuis le doc live. PUR.
 *  ⚠ Le doc ne porte pas d'horodatage PAR carte : repli sur celui du run pour toute carte
 *  non « pending » — même repli que `useServerRunLive`, pour ne pas raconter une seconde
 *  version de « depuis quand cette carte tourne ». */
function nodeStatesFromLiveDoc(d: RunLiveDoc): Record<string, NodeRunState> {
  const states: Record<string, NodeRunState> = {}
  for (const [id, status] of Object.entries(d.nodeStates ?? {})) {
    states[id] = {
      status, logs: [],
      startedAt: status === 'pending' ? undefined : d.startedAt,
      count: d.nodeCounts?.[id],
      cycles: d.nodeCycles?.[id],
    }
  }
  return states
}

/** `null` tant que le graphe ou le doc live n'ont pas répondu — jamais un avancement à 0
 *  inventé entre-temps. */
export function useLiveRunCards(workflowId: string | null): RunProgress | null {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const [wf, setWf] = useState<Workflow | null>(null)
  const [runDoc, setRunDoc] = useState<RunLiveDoc | null>(null)

  useEffect(() => {
    if (!uid || !workflowId) { setWf(null); return }
    let alive = true
    getWorkflow(uid, workflowId).then((w) => { if (alive) setWf(w) }).catch(() => { if (alive) setWf(null) })
    return () => { alive = false }
  }, [uid, workflowId])

  useEffect(() => {
    if (!uid || !workflowId) { setRunDoc(null); return }
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => setRunDoc((snap.data() as RunLiveDoc | undefined) ?? null),
      (e) => console.warn('[suivi] cartes du run illisibles :', e),
    )
  }, [uid, workflowId])

  if (!wf || !runDoc) return null
  return runProgress(wf, nodeStatesFromLiveDoc(runDoc), (id) => {
    const node = wf.nodes.find((n) => n.id === id)
    const spec = node && nodeRegistry.get(node.type)
    return spec ? t(spec.labelKey) : (node?.type ?? id)
  })
}
