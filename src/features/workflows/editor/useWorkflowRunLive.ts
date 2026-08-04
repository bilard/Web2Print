import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Abonnement au run SERVEUR live d'un workflow pour la console de suivi (éditeur) :
// le doc `users/{uid}/workflowRunsLive/{workflowId}` porte le flux de logs chronologique
// (200 derniers, streamé ~2 s pendant le run) et `workflowSchedules/{workflowId}` porte
// le POURQUOI d'un « dernier run en erreur » (lastError persisté par le scheduler).
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface RunLiveLog { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }
export interface RunLiveState {
  runId?: string
  trigger?: string
  startedAt?: number
  endedAt?: number
  status?: 'running' | 'success' | 'partial' | 'error'
  logs: RunLiveLog[]
  /** Dernier échec planifié (message + horodatage), persisté par le scheduler. */
  lastError?: string
  lastErrorAt?: number
}

export function useWorkflowRunLive(workflowId: string | undefined): RunLiveState {
  const [live, setLive] = useState<Omit<RunLiveState, 'lastError' | 'lastErrorAt'>>({ logs: [] })
  const [sched, setSched] = useState<{ lastStatus?: string; lastError?: string; lastErrorAt?: number }>({})

  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !workflowId) { setLive({ logs: [] }); setSched({}); return }
    const un1 = onSnapshot(doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (s) => {
        const d = s.data() as Partial<RunLiveState> | undefined
        setLive({
          runId: d?.runId, trigger: d?.trigger, startedAt: d?.startedAt, endedAt: d?.endedAt,
          status: d?.status, logs: Array.isArray(d?.logs) ? d!.logs! : [],
        })
      }, () => setLive({ logs: [] }))
    const un2 = onSnapshot(doc(db, 'workflowSchedules', workflowId),
      (s) => setSched(s.exists() ? (s.data() as typeof sched) : {}), () => setSched({}))
    return () => { un1(); un2() }
  }, [workflowId])

  return {
    ...live,
    lastError: sched.lastStatus === 'error' ? sched.lastError : undefined,
    lastErrorAt: sched.lastStatus === 'error' ? sched.lastErrorAt : undefined,
  }
}
