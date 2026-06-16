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
  /**
   * Démarre un run. Par défaut tous les états de nodes sont remis à zéro.
   * Passer `clearIds` pour un run partiel (RUN depuis une carte) : seuls ces
   * nodes sont réinitialisés, les autres conservent leur état/logs/sorties.
   */
  startRun: (opts?: { clearIds?: string[] }) => AbortController
  endRun: () => void
  resetRun: () => void
  setNodeStatus: (id: string, status: NodeStatus) => void
  startNode: (id: string) => void
  endNode: (id: string, status: NodeStatus, error?: string) => void
  appendLog: (id: string, level: 'info' | 'warn' | 'error', msg: string) => void
  /** Ajoute (dédupe) un connecteur réellement utilisé par le node ce run — affiché en live. */
  reportNodeConnector: (id: string, connectorId: string) => void
  /** Compteur live du node (ex. produits scrapés) — affiché sur l'edge sortant. */
  setNodeCount: (id: string, value: number) => void
  setNodeOutputs: (id: string, outputs: Record<string, unknown>) => void
  /** Applique l'état d'un run SERVEUR (statut + logs + sorties par node) reçu via
   *  Firestore. Ignoré si un run CLIENT est en cours (le local reste prioritaire). */
  hydrateServerRun: (states: Record<string, { status: NodeStatus; logs?: NodeRunState['logs']; outputs?: Record<string, unknown>; connectors?: string[] }>) => void
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
  startRun: (opts) => {
    const ac = new AbortController()
    const base = { isRunning: true, abortController: ac, edgesActive: new Set<string>(), pausedNodeId: null, stepResolver: null }
    if (opts?.clearIds) {
      // Run partiel : on ne réinitialise que le sous-graphe ciblé.
      const next = { ...get().nodeStates }
      for (const id of opts.clearIds) delete next[id]
      set({ ...base, nodeStates: next })
    } else {
      set({ ...base, nodeStates: {} })
    }
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
        // connectors remis à zéro : le live reflète CE run.
        ...s.nodeStates,
        [id]: { ...(s.nodeStates[id] ?? blankNode()), status: 'running', startedAt: Date.now(), connectors: [], count: undefined },
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
  reportNodeConnector: (id, connectorId) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      const current = prev.connectors ?? []
      if (current.includes(connectorId)) return s
      return {
        nodeStates: { ...s.nodeStates, [id]: { ...prev, connectors: [...current, connectorId] } },
      }
    }),
  setNodeCount: (id, value) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      if (prev.count === value) return s
      return { nodeStates: { ...s.nodeStates, [id]: { ...prev, count: value } } }
    }),
  setNodeOutputs: (id, outputs) =>
    set((s) => {
      const prev = s.nodeStates[id] ?? blankNode()
      return {
        nodeStates: { ...s.nodeStates, [id]: { ...prev, outputs } },
      }
    }),
  hydrateServerRun: (states) =>
    set((s) => {
      if (s.isRunning) return s // un run client local est prioritaire sur l'écho serveur
      const next = { ...s.nodeStates }
      for (const [id, v] of Object.entries(states)) {
        next[id] = {
          ...(next[id] ?? blankNode()),
          status: v.status,
          logs: v.logs ?? next[id]?.logs ?? [],
          outputs: v.outputs ?? next[id]?.outputs,
          connectors: v.connectors ?? next[id]?.connectors,
        }
      }
      return { nodeStates: next }
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
