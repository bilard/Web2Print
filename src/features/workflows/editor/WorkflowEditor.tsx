// src/features/workflows/editor/WorkflowEditor.tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type DefaultEdgeOptions,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnectStartParams,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BaseNode } from './nodes/BaseNode'
import { FlowEdge, FlowEdgeDefs } from './edges/FlowEdge'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { isCompatible, portTypeRegistry } from '../runtime/ports'
import { useConnectionDrag } from '../runtime/connectionDragStore'
import { useRunContext } from '../runtime/runContext'
import type { WorkflowEdge, WorkflowNode } from '../types'

const nodeTypes = { base: BaseNode }
const edgeTypes = { flow: FlowEdge }

const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'flow',
}

const connectionLineStyle = { stroke: '#818cf8', strokeWidth: 2, strokeDasharray: '5 4' }

export const WORKFLOW_DRAG_TYPE = 'application/x-workflow-node'

const toRfNode = (n: WorkflowNode): Node => ({
  id: n.id,
  type: 'base',
  position: n.position,
  data: { type: n.type, config: n.config },
})

const toRfEdge = (e: WorkflowEdge, nodes: WorkflowNode[]): Edge => {
  const sourceNode = nodes.find((n) => n.id === e.source)
  const sourceSpec = sourceNode ? nodeRegistry.get(sourceNode.type) : undefined
  const sourcePort = sourceSpec?.outputs.find((o) => o.name === e.sourceHandle)
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    data: { portType: sourcePort?.type ?? 'any' },
  }
}

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
  const clearRunNodes = useRunContext((s) => s.clearNodes)

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
      setEdges(wf.edges.map((e) => toRfEdge(e, wf.nodes)))
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
        merged.push(prevById.get(e.id) ?? toRfEdge(e, wf.nodes))
      }
      return merged
    })
  }, [wf])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedIds = changes
        .filter((c): c is Extract<NodeChange, { type: 'remove' }> => c.type === 'remove')
        .map((c) => c.id)
      setNodes((prev) => {
        const next = applyNodeChanges(changes, prev)
        const shouldPersist = changes.some((c) => PERSIST_NODE_CHANGE.has(c.type))
        if (shouldPersist) {
          queueMicrotask(() => setStoreNodes(next.map(fromRfNode)))
        }
        return next
      })
      if (removedIds.length > 0) {
        clearRunNodes(removedIds)
      }
    },
    [setStoreNodes, clearRunNodes],
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

  const resolveConnectionPorts = useCallback(
    (conn: Connection | Edge) => {
      if (!wf || !conn.source || !conn.target) return null
      const sourceNode = wf.nodes.find((n) => n.id === conn.source)
      const targetNode = wf.nodes.find((n) => n.id === conn.target)
      if (!sourceNode || !targetNode) return null
      const sourceSpec = nodeRegistry.get(sourceNode.type)
      const targetSpec = nodeRegistry.get(targetNode.type)
      const srcPort = sourceSpec?.outputs.find((o) => o.name === conn.sourceHandle)
      const tgtPort = targetSpec?.inputs.find((i) => i.name === conn.targetHandle)
      if (!srcPort || !tgtPort) return null
      return { srcPort, tgtPort, sourceSpec, targetSpec }
    },
    [wf],
  )

  const isValidConnection = useCallback(
    (conn: Connection | Edge) => {
      if (conn.source === conn.target) return false
      const ports = resolveConnectionPorts(conn)
      if (!ports) return false
      return isCompatible(ports.srcPort.type, ports.tgtPort.type)
    },
    [resolveConnectionPorts],
  )

  // Track whether the current drag gesture produced a valid connection.
  const connectionMadeRef = useRef(false)
  const dragSourcePortTypeRef = useRef<string | null>(null)
  const setDragStart = useConnectionDrag((s) => s.start)
  const clearDrag = useConnectionDrag((s) => s.end)

  const onConnectStart = useCallback(
    (_evt: unknown, params: OnConnectStartParams) => {
      connectionMadeRef.current = false
      if (!params.nodeId || !params.handleId || !params.handleType) return
      const node = wf?.nodes.find((n) => n.id === params.nodeId)
      if (!node) return
      const spec = nodeRegistry.get(node.type)
      const port =
        params.handleType === 'source'
          ? spec?.outputs.find((o) => o.name === params.handleId)
          : spec?.inputs.find((i) => i.name === params.handleId)
      if (!port) return
      dragSourcePortTypeRef.current = port.type
      setDragStart(port.type, params.handleType)
    },
    [wf, setDragStart],
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const fromType = dragSourcePortTypeRef.current
      const sourceLabel =
        (fromType && portTypeRegistry.get(fromType)?.label) ?? fromType ?? '?'
      clearDrag()
      dragSourcePortTypeRef.current = null
      if (connectionMadeRef.current) return
      // Did the user drop on a Handle? If so, the connection was rejected by
      // isValidConnection — surface a toast explaining why.
      const target = (event as MouseEvent).target as HTMLElement | null
      const handle = target?.closest('.react-flow__handle') as HTMLElement | null
      if (!handle) return
      // Find which port was the drop target by reading data attributes set by RF.
      const targetNodeId = handle
        .closest('.react-flow__node')
        ?.getAttribute('data-id')
      const targetHandleId = handle.getAttribute('data-handleid')
      const targetHandleType = handle.getAttribute('data-handlepos') // top|bottom|left|right
      const wasTargetSide = handle.classList.contains('target')
      if (!targetNodeId || !targetHandleId) return
      const node = wf?.nodes.find((n) => n.id === targetNodeId)
      const spec = node ? nodeRegistry.get(node.type) : undefined
      const targetPort = wasTargetSide
        ? spec?.inputs.find((i) => i.name === targetHandleId)
        : spec?.outputs.find((o) => o.name === targetHandleId)
      const targetLabel =
        (targetPort && portTypeRegistry.get(targetPort.type)?.label) ??
        targetPort?.type ??
        '?'
      void targetHandleType
      toast.error(
        `Types incompatibles : ${sourceLabel} → ${targetLabel}`,
        {
          description:
            'Insérez un node de transformation entre les deux (ex. Import CSV/Excel pour passer d\'un fichier à une Sheet).',
        },
      )
    },
    [clearDrag, wf],
  )

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return
      const ports = resolveConnectionPorts(conn)
      if (!ports) return
      if (!isCompatible(ports.srcPort.type, ports.tgtPort.type)) return
      connectionMadeRef.current = true
      upsertEdge({
        id: `e_${conn.source}_${conn.sourceHandle}_${conn.target}_${conn.targetHandle}`,
        source: conn.source,
        sourceHandle: conn.sourceHandle ?? 'out',
        target: conn.target,
        targetHandle: conn.targetHandle ?? 'in',
      })
    },
    [resolveConnectionPorts, upsertEdge],
  )

  const upsertStoreNode = useWorkflowStore((s) => s.upsertNode)
  const rfInstance = useReactFlow()

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData(WORKFLOW_DRAG_TYPE)
      if (!type) return
      const spec = nodeRegistry.get(type)
      if (!spec) return
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      upsertStoreNode({
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: spec.type,
        position,
        config: spec.defaultConfig,
      })
    },
    [rfInstance, upsertStoreNode],
  )

  return (
    <div className="flex-1 bg-[#0f0f0f]" onDragOver={onDragOver} onDrop={onDrop}>
      <FlowEdgeDefs />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionLineStyle={connectionLineStyle}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1f1f1f" gap={24} size={1} />
        <Controls
          className="!bg-[#1a1a1a] !border-neutral-800 [&>button]:!bg-[#1a1a1a] [&>button]:!border-neutral-800 [&>button]:!text-neutral-400 [&>button:hover]:!bg-[#222]"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#0f0f0f] !border !border-neutral-800"
          maskColor="rgba(15,15,15,0.85)"
          nodeColor="#6366f1"
          nodeBorderRadius={4}
          nodeStrokeWidth={0}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}
