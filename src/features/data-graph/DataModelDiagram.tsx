// src/features/data-graph/DataModelDiagram.tsx
import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Panel, applyNodeChanges, useReactFlow,
  type Node, type NodeChange, type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Database, Zap, Plus, Minus, Maximize } from 'lucide-react'
import { useThemeStore } from '@/stores/theme.store'
import { buildDiagram, type TableNodeData } from './buildDiagram'
import { TABLES } from './firestoreSchema'
import { TableNode } from './TableNode'
import { TableDataPanel } from './TableDataPanel'

const nodeTypes = { table: TableNode }

/** Contrôles de zoom thémés (les <Controls> par défaut de ReactFlow rendent en blanc). */
function DiagramControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const btn = 'flex h-7 w-7 items-center justify-center text-white/55 transition-colors hover:text-white'
  return (
    <Panel position="bottom-left" className="!m-3 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-well/95 backdrop-blur">
      <button onClick={() => zoomIn({ duration: 150 })} title="Zoom avant" className={`${btn} border-b border-white/10`}><Plus className="h-3.5 w-3.5" /></button>
      <button onClick={() => zoomOut({ duration: 150 })} title="Zoom arrière" className={`${btn} border-b border-white/10`}><Minus className="h-3.5 w-3.5" /></button>
      <button onClick={() => fitView({ padding: 0.15, duration: 250 })} title="Recadrer" className={btn}><Maximize className="h-3.5 w-3.5" /></button>
    </Panel>
  )
}

/** Vue « Données » : diagramme ERD des collections Firestore (tous les champs, PK/FK,
 *  relations + cardinalités). Double-clic sur une table interrogeable → panneau de
 *  données live ancré en bas. Nœuds déplaçables (session), zoom/pan. */
export function DataModelDiagram() {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const initial = useMemo(() => buildDiagram(), [])
  const [nodes, setNodes] = useState<Node[]>(initial.nodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)),
    [],
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    const { table } = node.data as TableNodeData
    if (table.query) setSelectedId(table.id)
  }, [])

  const selectedTable = selectedId ? TABLES.find((t) => t.id === selectedId) ?? null : null
  const styledNodes = useMemo(
    () => nodes.map((n) => (n.id === selectedId ? { ...n, selected: true } : { ...n, selected: false })),
    [nodes, selectedId],
  )

  return (
    <div className="relative flex h-full min-h-[540px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-well">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <Database className="h-5 w-5 text-indigo-400" />
        <span className="text-[15px] font-bold text-white">Modèle de Données</span>
        <span className="ml-auto hidden items-center rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-[12px] text-white/40 md:flex">
          Double-cliquez sur une table pour voir les données
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-white/45">
          <Zap className="h-3.5 w-3.5 text-amber-400" /> Source : Firestore
        </span>
      </div>

      {/* Diagramme */}
      <div className="relative flex-1 min-h-0">
        <ReactFlow
          nodes={styledNodes}
          edges={initial.edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeDoubleClick={onNodeDoubleClick}
          nodesConnectable={false}
          elementsSelectable
          minZoom={0.2}
          maxZoom={1.8}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={isLight ? '#d4d4d8' : '#1f1f1f'} gap={22} size={1} />
          <DiagramControls />
        </ReactFlow>

        {selectedTable && (
          <TableDataPanel table={selectedTable} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}
