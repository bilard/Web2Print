// src/features/workflows/runtime/runContext.ts
import { create } from 'zustand'
import type { NodeRunState, NodeStatus } from '../types'

interface RunContextState {
  isRunning: boolean
  abortController: AbortController | null
  nodeStates: Record<string, NodeRunState>
  edgesActive: Set<string>
  startRun: () => AbortController
  endRun: () => void
  resetRun: () => void
  setNodeStatus: (id: string, status: NodeStatus) => void
  startNode: (id: string) => void
  endNode: (id: string, status: NodeStatus, error?: string) => void
  appendLog: (id: string, level: 'info' | 'warn' | 'error', msg: string) => void
  setNodeOutputs: (id: string, outputs: Record<string, unknown>) => void
}

const blankNode = (): NodeRunState => ({ status: 'pending', logs: [] })

export const useRunContext = create<RunContextState>((set, get) => ({
  isRunning: false,
  abortController: null,
  nodeStates: {},
  edgesActive: new Set(),
  startRun: () => {
    const ac = new AbortController()
    set({ isRunning: true, abortController: ac, nodeStates: {}, edgesActive: new Set() })
    return ac
  },
  endRun: () => set({ isRunning: false, abortController: null }),
  resetRun: () => set({ isRunning: false, abortController: null, nodeStates: {}, edgesActive: new Set() }),
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
}))
