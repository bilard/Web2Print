// src/features/workflows/editor/WorkflowEditor.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BaseNode } from './nodes/BaseNode'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { isCompatible } from '../runtime/ports'
import type { WorkflowEdge, WorkflowNode } from '../types'

const nodeTypes = { base: BaseNode }

const toRfNode = (n: WorkflowNode): Node => ({
  id: n.id,
  type: 'base',
  position: n.position,
  data: { type: n.type, config: n.config },
})

const toRfEdge = (e: WorkflowEdge): Edge => ({
  id: e.id,
  source: e.source,
  target: e.target,
  sourceHandle: e.sourceHandle,
  targetHandle: e.targetHandle,
})

const fromRfNode = (n: Node): WorkflowNode => ({
  id: n.id,
  type: (n.data as { type: string }).type,
  position: n.position,
  config: (n.data as { config: unknown }).config,
})

const fromRfEdge = (e: Edge): WorkflowEdge => ({
  id: e.id,
  source: e.source,
  sourceHandle: e.sourceHandle ?? 'out',
  target: e.target,
  targetHandle: e.targetHandle ?? 'in',
})

const PERSIST_NODE_CHANGE = new Set(['position', 'remove'])
const PERSIST_EDGE_CHANGE = new Set(['add', 'remove'])

export function WorkflowEditor() {
  const wf = useWorkflowStore((s) => s.current)
  const setStoreNodes = useWorkflowStore((s) => s.setNodes)
  const setStoreEdges = useWorkflowStore((s) => s.setEdges)
  const upsertEdge = useWorkflowStore((s) => s.upsertEdge)

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const loadedWfId = useRef<string | null>(null)

  // Sync external store mutations into local RF state.
  // Mirroring back to the store is handled by onNodesChange/onEdgesChange,
  // not via a useEffect — that prevents the store↔RF feedback loop.
  useEffect(() => {
    if (!wf) {
      setNodes([])
      setEdges([])
      loadedWfId.current = null
      return
    }
    if (loadedWfId.current !== wf.id) {
      setNodes(wf.nodes.map(toRfNode))
      setEdges(wf.edges.map(toRfEdge))
      loadedWfId.current = wf.id
      return
    }
    setNodes((prev) => {
      const prevIds = new Set(prev.map((n) => n.id))
      const wfIds = new Set(wf.nodes.map((n) => n.id))
      const sameSet =
        prevIds.size === wfIds.size && [...prevIds].every((id) => wfIds.has(id))
      if (sameSet) return prev
      const prevById = new Map(prev.map((n) => [n.id, n]))
      const merged: Node[] = []
      for (const n of wf.nodes) {
        const existing = prevById.get(n.id)
        merged.push(
          existing
            ? { ...existing, data: { type: n.type, config: n.config } }
            : toRfNode(n),
        )
      }
      return merged
    })
    setEdges((prev) => {
      const prevIds = new Set(prev.map((e) => e.id))
      const wfIds = new Set(wf.edges.map((e) => e.id))
      const sameSet =
        prevIds.size === wfIds.size && [...prevIds].every((id) => wfIds.has(id))
      if (sameSet) return prev
      const prevById = new Map(prev.map((e) => [e.id, e]))
      const merged: Edge[] = []
      for (const e of wf.edges) {
        merged.push(prevById.get(e.id) ?? toRfEdge(e))
      }
      return merged
    })
  }, [wf])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev)
        const shouldPersist = changes.some((c) => PERSIST_NODE_CHANGE.has(c.type))
        if (shouldPersist) {
          queueMicrotask(() => setStoreNodes(next.map(fromRfNode)))
        }
        return next
      })
    },
    [setStoreNodes],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => {
        const next = applyEdgeChanges(changes, prev)
        const shouldPersist = changes.some((c) => PERSIST_EDGE_CHANGE.has(c.type))
        if (shouldPersist) {
          queueMicrotask(() => setStoreEdges(next.map(fromRfEdge)))
        }
        return next
      })
    },
    [setStoreEdges],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!wf || !conn.source || !conn.target) return
      const sourceNode = wf.nodes.find((n) => n.id === conn.source)
      const targetNode = wf.nodes.find((n) => n.id === conn.target)
      if (!sourceNode || !targetNode) return
      const sourceSpec = nodeRegistry.get(sourceNode.type)
      const targetSpec = nodeRegistry.get(targetNode.type)
      const srcPort = sourceSpec?.outputs.find((o) => o.name === conn.sourceHandle)
      const tgtPort = targetSpec?.inputs.find((i) => i.name === conn.targetHandle)
      if (!srcPort || !tgtPort || !isCompatible(srcPort.type, tgtPort.type)) return
      upsertEdge({
        id: `e_${conn.source}_${conn.sourceHandle}_${conn.target}_${conn.targetHandle}`,
        source: conn.source,
        sourceHandle: conn.sourceHandle ?? 'out',
        target: conn.target,
        targetHandle: conn.targetHandle ?? 'in',
      })
    },
    [wf, upsertEdge],
  )

  return (
    <div className="flex-1 bg-[#0f0f0f]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#222" gap={20} />
        <Controls className="!bg-[#1a1a1a] !border-neutral-800" />
        <MiniMap className="!bg-[#1a1a1a]" maskColor="rgba(0,0,0,0.6)" />
      </ReactFlow>
    </div>
  )
}
