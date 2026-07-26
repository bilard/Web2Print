// Affiche sur les cartes de l'éditeur l'état du dernier run SERVEUR (cron / « Lancer
// serveur ») : sans ça, un run headless est invisible côté navigateur. S'abonne au doc
// users/{uid}/workflowRunsLive/{workflowId} écrit par les Functions et hydrate le runContext.
import { useEffect, useRef } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { useRunContext } from './runContext'
import type { NodeStatus } from '../types'

interface RunLiveDoc {
  runId?: string
  status?: string
  nodeStates?: Record<string, NodeStatus>
  logs?: { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }[]
  nodeOutputs?: Record<string, Record<string, unknown>>
  nodeConnectors?: Record<string, string[]>
}

export function useServerRunLive(workflowId: string | undefined): void {
  const lastRunId = useRef<string | undefined>(undefined)
  const isInitial = useRef(true)
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid || !workflowId) return
    lastRunId.current = undefined
    isInitial.current = true
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => {
        const d = snap.data() as RunLiveDoc | undefined
        if (!d?.nodeStates) { isInitial.current = false; return }
        // Écho INITIAL d'un run serveur DÉJÀ TERMINÉ (au chargement de page) : on ne ré-hydrate
        // PAS. L'aperçu durable (workflowRuns, toutes sources) montre déjà le dernier run ;
        // ré-hydrater ici écraserait un run CLIENT plus récent par ce run serveur plus ancien.
        // On ne prend la main que pour un run qui DÉMARRE / PROGRESSE pendant la session.
        const terminal = !!d.status && d.status !== 'running' && d.status !== 'pending'
        if (isInitial.current && terminal) {
          isInitial.current = false
          lastRunId.current = d.runId
          return
        }
        isInitial.current = false
        // Nouveau run (runId changé) → on vide l'état précédent (aperçu/cartes périmés).
        const reset = !!d.runId && d.runId !== lastRunId.current
        lastRunId.current = d.runId
        // Tout nouveau run SERVEUR (runId changé, quel que soit son statut) reprend la main
        // sur un run client resté « en cours » (isRunning coincé) qui, sinon, masquerait son
        // état (garde dans hydrateServerRun). Sûr : workflowRunsLive n'est écrit QUE par le
        // serveur → un run client (qui n'écrit pas ce doc) ne peut pas auto-déclencher ceci.
        if (reset && useRunContext.getState().isRunning) {
          useRunContext.getState().resetRun()
        }
        const logsByNode: Record<string, RunLiveDoc['logs']> = {}
        for (const l of d.logs ?? []) {
          if (!l.node) continue
          ;(logsByNode[l.node] ??= []).push(l)
        }
        const states: Record<string, { status: NodeStatus; logs?: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]; outputs?: Record<string, unknown>; connectors?: string[] }> = {}
        for (const [id, status] of Object.entries(d.nodeStates)) {
          states[id] = {
            status,
            logs: logsByNode[id]?.map((l) => ({ ts: l.ts, level: l.level, msg: l.msg })),
            outputs: d.nodeOutputs?.[id],
            connectors: d.nodeConnectors?.[id],
          }
        }
        useRunContext.getState().hydrateServerRun(states, { reset })
      },
      (e) => console.warn('[runLive] écoute interrompue :', e.message),
    )
  }, [workflowId])
}
