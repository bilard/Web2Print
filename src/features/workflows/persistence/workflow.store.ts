// src/features/workflows/persistence/workflow.store.ts
import { create } from 'zustand'
import type { Workflow, WorkflowNode, WorkflowEdge } from '../types'
import { saveWorkflow } from './workflowsApi'

interface WorkflowStoreState {
  current: Workflow | null
  dirty: boolean
  saving: boolean
  lastSavedAt: number | null
  setCurrent: (wf: Workflow | null) => void
  patch: (patch: Partial<Workflow>) => void
  setNodes: (nodes: WorkflowNode[]) => void
  setEdges: (edges: WorkflowEdge[]) => void
  upsertNode: (node: WorkflowNode) => void
  removeNode: (id: string) => void
  upsertEdge: (edge: WorkflowEdge) => void
  removeEdge: (id: string) => void
  flush: (uid: string) => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkflowStore = create<WorkflowStoreState>((set, get) => {
  const markDirty = () => {
    set({ dirty: true })
  }
  return {
    current: null,
    dirty: false,
    saving: false,
    lastSavedAt: null,
    setCurrent: (wf) => set({ current: wf, dirty: false, lastSavedAt: null }),
    patch: (p) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, ...p } })
      markDirty()
    },
    setNodes: (nodes) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, nodes } })
      markDirty()
    },
    setEdges: (edges) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, edges } })
      markDirty()
    },
    upsertNode: (node) => {
      const cur = get().current
      if (!cur) return
      const i = cur.nodes.findIndex((n) => n.id === node.id)
      const nodes = i === -1 ? [...cur.nodes, node] : cur.nodes.map((n) => (n.id === node.id ? node : n))
      set({ current: { ...cur, nodes } })
      markDirty()
    },
    removeNode: (id) => {
      const cur = get().current
      if (!cur) return
      const nodes = cur.nodes.filter((n) => n.id !== id)
      const edges = cur.edges.filter((e) => e.source !== id && e.target !== id)
      set({ current: { ...cur, nodes, edges } })
      markDirty()
    },
    upsertEdge: (edge) => {
      const cur = get().current
      if (!cur) return
      const i = cur.edges.findIndex((e) => e.id === edge.id)
      const edges = i === -1 ? [...cur.edges, edge] : cur.edges.map((e) => (e.id === edge.id ? edge : e))
      set({ current: { ...cur, edges } })
      markDirty()
    },
    removeEdge: (id) => {
      const cur = get().current
      if (!cur) return
      set({ current: { ...cur, edges: cur.edges.filter((e) => e.id !== id) } })
      markDirty()
    },
    flush: async (uid) => {
      const cur = get().current
      if (!cur || !get().dirty) return
      set({ saving: true })
      try {
        await saveWorkflow(uid, cur)
        set({ dirty: false, lastSavedAt: Date.now() })
      } finally {
        set({ saving: false })
      }
    },
  }
})

export function startAutosave(uid: string, intervalMs = 1500): () => void {
  return useWorkflowStore.subscribe((s) => {
    if (saveTimer) clearTimeout(saveTimer)
    if (s.dirty && !s.saving && s.current) {
      saveTimer = setTimeout(() => useWorkflowStore.getState().flush(uid), intervalMs)
    }
  }) as unknown as () => void
}
