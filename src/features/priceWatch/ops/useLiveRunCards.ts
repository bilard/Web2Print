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
import { initWorkflowsRegistry } from '../../workflows/registry/builtin'
import { runProgress, type RunProgress } from '../../workflows/runtime/runProgress'
import type { Workflow, NodeRunState, NodeStatus } from '../../workflows/types'
import { useTranslation } from '@/lib/i18n'

interface RunLiveDoc {
  startedAt?: number
  nodeStates?: Record<string, NodeStatus>
  nodeCounts?: Record<string, number>
  nodeCycles?: Record<string, number>
  /** Journal du run, tel que le moteur l'écrit — porte le POURQUOI d'une carte sautée. */
  logs?: { ts: number; level: string; node?: string; msg: string }[]
}

/**
 * Pourquoi chaque carte SAUTÉE l'a été, dans ses propres mots. PUR.
 *
 * ⚠⚠ Le trou constaté en production : la cadence d'envoi suspend l'aval (« Déjà envoyé
 * pour cette période »), donc le rapport n'est pas recomposé et le mail ne part pas. Sur
 * l'écran, trois cartes passaient simplement en gris — et l'utilisateur, relisant le mail
 * de la veille, croyait que sa consigne était ignorée. La raison EXISTAIT, dans le journal
 * du run ; personne ne la rapprochait de la carte.
 */
export function skipReasons(d: RunLiveDoc): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of d.logs ?? []) {
    if (!l.node || d.nodeStates?.[l.node] !== 'skipped') continue
    // Le DERNIER message de la carte : c'est celui qui a décidé du saut.
    out[l.node] = l.msg
  }
  return out
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
export function useLiveRunCards(workflowId: string | null): (RunProgress & { skipped_: Record<string, string> }) | null {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const [wf, setWf] = useState<Workflow | null>(null)
  const [runDoc, setRunDoc] = useState<RunLiveDoc | null>(null)

  // ⚠⚠ SANS ceci, les cartes s'affichaient sous leur nom TECHNIQUE — `harvest-competitor`,
  // `compare-catalog`, `gsheets-import`, `text-enrich` — là où l'éditeur montre des
  // libellés lisibles. Le registre des nodes se remplit par EFFET DE BORD : les specs ne
  // sont enregistrées que si `builtin.ts` a été importé, ce que font l'éditeur et l'écran
  // Résultats mais que le module « Suivi » ne faisait pas. `nodeRegistry.get()` renvoyait
  // donc `undefined` et le repli sur `node.type` prenait la main — un repli qui restait
  // muet, puisqu'il produit une chaîne parfaitement affichable. Idempotent, sans coût au
  // second appel.
  useEffect(() => { initWorkflowsRegistry() }, [])

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
  const progress = runProgress(wf, nodeStatesFromLiveDoc(runDoc), (id) => {
    const node = wf.nodes.find((n) => n.id === id)
    const spec = node && nodeRegistry.get(node.type)
    return spec ? t(spec.labelKey) : (node?.type ?? id)
  })
  return { ...progress, skipped_: skipReasons(runDoc) }
}
