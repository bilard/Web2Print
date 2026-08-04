import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Source de données de l'écran Résultats : historique DURABLE des runs (users/{uid}/
// workflowRuns, écrit par le serveur ET le client) + repli sur le dernier run live
// (workflowRunsLive serveur / runContext client même session) si aucun snapshot.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getWorkflow } from '../persistence/workflowsApi'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useRunContext } from '../runtime/runContext'
import { buildResultPanels } from './classifyResult'
import type { Workflow } from '../types'
import type { ResultPanel } from './types'

interface RunLiveDoc {
  status?: string
  endedAt?: number
  nodeOutputs?: Record<string, Record<string, unknown>>
}

export interface RunHistoryItem {
  id: string
  status?: string
  trigger?: string
  endedAt?: number
  nodeOutputs?: Record<string, Record<string, unknown>>
}

export interface RunResult {
  loading: boolean
  wf: Workflow | null
  error?: string
  runs: RunHistoryItem[]
  selectedRunId: string | null
  selectRun: (id: string | null) => void
  source: 'history' | 'server' | 'client' | null
  status?: string
  endedAt?: number
  panels: ResultPanel[]
}

export function useRunResult(workflowId: string | undefined): RunResult {
  const storeCurrent = useWorkflowStore((s) => s.current)
  const ctxStates = useRunContext((s) => s.nodeStates)
  const [wf, setWf] = useState<Workflow | null>(null)
  const [live, setLive] = useState<RunLiveDoc | null>(null)
  const [runs, setRuns] = useState<RunHistoryItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>()

  // Def du workflow : store si déjà chargé, sinon Firestore.
  useEffect(() => {
    if (!workflowId) return
    if (storeCurrent?.id === workflowId) { setWf(storeCurrent); setLoading(false); return }
    const uid = getWorkspaceUid()
    if (!uid) { setError('Non connecté.'); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    getWorkflow(uid, workflowId)
      .then((w) => { if (cancelled) return; setWf(w); setLoading(false); if (!w) setError('Workflow introuvable.') })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
    return () => { cancelled = true }
  }, [workflowId, storeCurrent])

  // Historique durable. Requête where-only (pas d'orderBy → AUCUN index composite requis,
  // donc dispo immédiatement) : on trie + filtre côté client. On ne garde que les runs
  // RÉELLEMENT consultables (snapshot avec sorties) — les vieux docs métadonnées seuls
  // (runs cron d'avant la persistance) sont écartés.
  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !workflowId) return
    const q = query(collection(db, 'users', uid, 'workflowRuns'), where('workflowId', '==', workflowId))
    return onSnapshot(q, (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<RunHistoryItem, 'id'>) }))
        .filter((r) => r.nodeOutputs && Object.keys(r.nodeOutputs).length > 0)
      items.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      setRuns(items.slice(0, 20))
    }, (e) => console.warn('[results] historique interrompu :', e.message))
  }, [workflowId])

  // Dernier run live (repli si pas d'historique).
  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !workflowId) return
    return onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => setLive((snap.data() as RunLiveDoc) ?? null),
      (e) => console.warn('[results] écoute live interrompue :', e.message),
    )
  }, [workflowId])

  // Outputs du run client de la session (même workflow), repli si pas d'historique.
  const clientOutputs = useMemo(() => {
    if (storeCurrent?.id !== workflowId) return null
    const out: Record<string, Record<string, unknown>> = {}
    for (const [id, st] of Object.entries(ctxStates)) {
      if (st.outputs && Object.keys(st.outputs).length > 0) out[id] = st.outputs
    }
    return Object.keys(out).length > 0 ? out : null
  }, [ctxStates, storeCurrent, workflowId])

  return useMemo(() => {
    // Run sélectionné (s'il existe encore après une suppression), sinon le plus récent.
    const stillExists = selectedRunId && runs.some((r) => r.id === selectedRunId)
    const effectiveId = (stillExists ? selectedRunId : runs[0]?.id) ?? null
    const histRun = effectiveId ? runs.find((r) => r.id === effectiveId) : undefined

    let source: 'history' | 'server' | 'client' | null = null
    let outputs: Record<string, Record<string, unknown>> = {}
    let status: string | undefined
    let endedAt: number | undefined

    if (histRun?.nodeOutputs && Object.keys(histRun.nodeOutputs).length > 0) {
      source = 'history'; outputs = histRun.nodeOutputs; status = histRun.status; endedAt = histRun.endedAt
    } else if (clientOutputs) {
      source = 'client'; outputs = clientOutputs
    } else if (live?.nodeOutputs && Object.keys(live.nodeOutputs).length > 0) {
      source = 'server'; outputs = live.nodeOutputs; status = live.status; endedAt = live.endedAt
    }

    const panels = wf && source ? buildResultPanels(wf, outputs) : []
    return { loading, wf, error, runs, selectedRunId, selectRun: setSelectedRunId, source, status, endedAt, panels }
  }, [wf, live, clientOutputs, runs, selectedRunId, loading, error])
}
