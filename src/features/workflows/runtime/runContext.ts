// src/features/workflows/runtime/runContext.ts
import { create } from 'zustand'
import type { NodeRunState, NodeStatus } from '../types'

interface RunContextState {
  isRunning: boolean
  abortController: AbortController | null
  nodeStates: Record<string, NodeRunState>
  edgesActive: Set<string>
  /** Mode pas-à-pas : node en attente du clic « Étape suivante » (null sinon). */
  pausedNodeId: string | null
  stepResolver: (() => void) | null
  startRun: () => AbortController
  endRun: () => void
  resetRun: () => void
  setNodeStatus: (id: string, status: NodeStatus) => void
  startNode: (id: string) => void
  endNode: (id: string, status: NodeStatus, error?: string) => void
  appendLog: (id: string, level: 'info' | 'warn' | 'error', msg: string) => void
  setNodeOutputs: (id: string, outputs: Record<string, unknown>) => void
  clearNodes: (ids: string[]) => void
  /** Bloque jusqu'au clic « Étape suivante » (ou abort du run). */
  waitForStep: (nodeId: string) => Promise<void>
  continueStep: () => void
}

const blankNode = (): NodeRunState => ({ status: 'pending', logs: [] })

export const useRunContext = create<RunContextState>((set, get) => ({
  isRunning: false,
  abortController: null,
  nodeStates: {},
  edgesActive: new Set(),
  pausedNodeId: null,
  stepResolver: null,
  startRun: () => {
    const ac = new AbortController()
    set({ isRunning: true, abortController: ac, nodeStates: {}, edgesActive: new Set(), pausedNodeId: null, stepResolver: null })
    return ac
  },
  endRun: () => set({ isRunning: false, abortController: null, pausedNodeId: null, stepResolver: null }),
  resetRun: () => set({ isRunning: false, abortController: null, nodeStates: {}, edgesActive: new Set(), pausedNodeId: null, stepResolver: null }),
  setNodeStatus: (id, status) =>
    set((s) => ({
      nodeStates: { ...s.nodeStates, [id]: { ...(s.nodeStates[id] ?? blankNode()), status } },
    })),
  startNode: (id) =>
    set((s) => ({
      nodeStates: {
        ...s.nodeStates,
        [id]: { ...(s.nodeStates[id] ?? blankNode()), status: 'running', startedAt: Date.now() },
      },
    })),
  endNode: (id, status, error) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      const endedAt = Date.now()
      return {
        nodeStates: {
          ...s.nodeStates,
          [id]: {
            ...prev,
            status,
            endedAt,
            durationMs: prev.startedAt ? endedAt - prev.startedAt : undefined,
            error,
          },
        },
      }
    }),
  appendLog: (id, level, msg) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      return {
        nodeStates: {
          ...s.nodeStates,
          [id]: { ...prev, logs: [...prev.logs, { ts: Date.now(), level, msg }] },
        },
      }
    }),
  setNodeOutputs: (id, outputs) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      return {
        nodeStates: { ...s.nodeStates, [id]: { ...prev, outputs } },
      }
    }),
  clearNodes: (ids) =>
    set((s) => {
      if (ids.length === 0) return s
      const next = { ...s.nodeStates }
      for (const id of ids) delete next[id]
      return { nodeStates: next }
    }),
  waitForStep: (nodeId) => {
    const ac = get().abortController
    if (!ac || ac.signal.aborted) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const finish = () => {
        ac.signal.removeEventListener('abort', finish)
        set({ pausedNodeId: null, stepResolver: null })
        resolve()
      }
      // Un Stop pendant la pause doit débloquer la promesse (l'executor verra
      // ensuite signal.aborted et terminera proprement).
      ac.signal.addEventListener('abort', finish)
      set({ pausedNodeId: nodeId, stepResolver: finish })
    })
  },
  continueStep: () => {
    get().stepResolver?.()
  },
}))

/**
 * Middleware « pas-à-pas » pour executeWorkflow : met le run en pause AVANT chaque
 * node jusqu'au clic « Étape suivante ». Les bodies de loop (exécutés hors topo
 * principal) ne sont pas concernés.
 */
export async function stepMiddleware(node: { id: string }, next: () => Promise<void>): Promise<void> {
  await useRunContext.getState().waitForStep(node.id)
  await next()
}
