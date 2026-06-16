// src/features/workflows/runtime/useServerRunLive.ts
// Affiche sur les cartes de l'éditeur l'état du dernier run SERVEUR (cron / « Lancer
// serveur ») : sans ça, un run headless est invisible côté navigateur. S'abonne au doc
// users/{uid}/workflowRunsLive/{workflowId} écrit par les Functions et hydrate le runContext.
import { useEffect } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { useRunContext } from './runContext'
import type { NodeStatus } from '../types'

interface RunLiveDoc {
  status?: string
  nodeStates?: Record<string, NodeStatus>
  logs?: { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }[]
  nodeOutputs?: Record<string, Record<string, unknown>>
}

export function useServerRunLive(workflowId: string | undefined): void {
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid || !workflowId) return
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => {
        const d = snap.data() as RunLiveDoc | undefined
        if (!d?.nodeStates) return
        const logsByNode: Record<string, RunLiveDoc['logs']> = {}
        for (const l of d.logs ?? []) {
          if (!l.node) continue
          ;(logsByNode[l.node] ??= []).push(l)
        }
        const states: Record<string, { status: NodeStatus; logs?: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]; outputs?: Record<string, unknown> }> = {}
        for (const [id, status] of Object.entries(d.nodeStates)) {
          states[id] = {
            status,
            logs: logsByNode[id]?.map((l) => ({ ts: l.ts, level: l.level, msg: l.msg })),
            outputs: d.nodeOutputs?.[id],
          }
        }
        useRunContext.getState().hydrateServerRun(states)
      },
      (e) => console.warn('[runLive] écoute interrompue :', e.message),
    )
  }, [workflowId])
}
