// src/features/workflows/results/useRunResult.ts
// Source de données de l'écran Résultats (Phase 1) : pas de stockage nouveau, on lit le
// DERNIER run déjà disponible — serveur/cron via workflowRunsLive/{id} (Firestore,
// durable au reload), ou client via runContext (Zustand, même session/même workflow).
import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { getWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useRunContext } from '../runtime/runContext'
import { buildResultPanels } from './classifyResult'
import type { Workflow } from '../types'
import type { ResultPanel } from './types'

interface RunLiveDoc {
  runId?: string
  status?: string
  startedAt?: number
  endedAt?: number
  nodeOutputs?: Record<string, Record<string, unknown>>
}

export interface RunResult {
  loading: boolean
  wf: Workflow | null
  source: 'server' | 'client' | null
  status?: string
  endedAt?: number
  panels: ResultPanel[]
  error?: string
}

export function useRunResult(workflowId: string | undefined): RunResult {
  const storeCurrent = useWorkflowStore((s) => s.current)
  const ctxStates = useRunContext((s) => s.nodeStates)
  const [wf, setWf] = useState<Workflow | null>(null)
  const [live, setLive] = useState<RunLiveDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  // Def du workflow : store si déjà chargé (navigation depuis l'éditeur), sinon Firestore.
  useEffect(() => {
    if (!workflowId) return
    if (storeCurrent?.id === workflowId) { setWf(storeCurrent); setLoading(false); return }
    const uid = auth.currentUser?.uid
    if (!uid) { setError('Non connecté.'); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    getWorkflow(uid, workflowId)
      .then((w) => { if (cancelled) return; setWf(w); setLoading(false); if (!w) setError('Workflow introuvable.') })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [workflowId, storeCurrent])

  // Dernier run serveur.
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid || !workflowId) return
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => setLive((snap.data() as RunLiveDoc) ?? null),
      (e) => console.warn('[results] écoute interrompue :', e.message),
    )
  }, [workflowId])

  // Choix de la source : client si CE workflow a tourné dans la session, sinon serveur.
  const clientOutputs = useMemo(() => {
    if (storeCurrent?.id !== workflowId) return null
    const out: Record<string, Record<string, unknown>> = {}
    for (const [id, st] of Object.entries(ctxStates)) {
      if (st.outputs && Object.keys(st.outputs).length > 0) out[id] = st.outputs
    }
    return Object.keys(out).length > 0 ? out : null
  }, [ctxStates, storeCurrent, workflowId])

  return useMemo(() => {
    let source: 'server' | 'client' | null = null
    let outputs: Record<string, Record<string, unknown>> = {}
    let status: string | undefined
    let endedAt: number | undefined
    if (clientOutputs) {
      source = 'client'
      outputs = clientOutputs
    } else if (live?.nodeOutputs && Object.keys(live.nodeOutputs).length > 0) {
      source = 'server'
      outputs = live.nodeOutputs
      status = live.status
      endedAt = live.endedAt
    }
    const panels = wf && source ? buildResultPanels(wf, outputs) : []
    return { loading, wf, source, status, endedAt, panels, error }
  }, [wf, live, clientOutputs, loading, error])
}
