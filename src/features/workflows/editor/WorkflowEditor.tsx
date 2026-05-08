// src/features/workflows/editor/WorkflowEditor.tsx
import { useCallback, useMemo } from 'react'
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

const nodeTypes = { base: BaseNode }

export function WorkflowEditor() {
  const wf = useWorkflowStore((s) => s.current)
  const setNodes = useWorkflowStore((s) => s.setNodes)
  const setEdges = useWorkflowStore((s) => s.setEdges)
  const upsertEdge = useWorkflowStore((s) => s.upsertEdge)

  const rfNodes: Node[] = useMemo(
    () =>
      (wf?.nodes ?? []).map((n) => ({
        id: n.id,
        type: 'base',
        position: n.position,
        data: { type: n.type, config: n.config },
      })),
    [wf?.nodes]
  )
  const rfEdges: Edge[] = useMemo(
    () =>
      (wf?.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    [wf?.edges]
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!wf) return
      const next = applyNodeChanges(changes, rfNodes)
      setNodes(
        next.map((n) => {
          const existing = wf.nodes.find((x) => x.id === n.id)
          return {
            id: n.id,
            type: existing?.type ?? (n.data as any).type,
            position: n.position,
            config: existing?.config ?? (n.data as any).config,
          }
        })
      )
    },
    [wf, rfNodes, setNodes]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!wf) return
      const next = applyEdgeChanges(changes, rfEdges)
      setEdges(
        next.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle ?? 'out',
          target: e.target,
          targetHandle: e.targetHandle ?? 'in',
        }))
      )
    },
    [wf, rfEdges, setEdges]
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
    [wf, upsertEdge]
  )

  return (
    <div className="flex-1 bg-[#0f0f0f]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
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
