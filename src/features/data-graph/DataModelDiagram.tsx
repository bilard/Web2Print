import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, Panel, applyNodeChanges, useReactFlow,
  type Node, type NodeChange, type NodeMouseHandler, type FitViewOptions,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Database, Zap, Plus, Minus, Maximize } from 'lucide-react'
import { useThemeStore } from '@/stores/theme.store'
import { buildDiagram, type TableNodeData } from './buildDiagram'
import { TABLES } from './firestoreSchema'
import { TableNode } from './TableNode'
import { TableDataPanel } from './TableDataPanel'
import { SchemaPanelProvider, TableSchemaPanel } from './TableSchemaPanel'
import { useDiagramLayout } from './useDiagramLayout'
import { t } from '@/lib/i18n'

const nodeTypes = { table: TableNode }

/** Contrôles de zoom thémés (les <Controls> par défaut de ReactFlow rendent en blanc). */
function DiagramControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const btn = 'flex h-7 w-7 items-center justify-center text-white/55 transition-colors hover:text-white'
  return (
    <Panel position="bottom-left" className="!m-3 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-well/95 backdrop-blur">
      <button onClick={() => zoomIn({ duration: 150 })} title="Zoom avant" className={`${btn} border-b border-white/10`}><Plus className="h-3.5 w-3.5" /></button>
      <button onClick={() => zoomOut({ duration: 150 })} title={t('dg.zoomOut')} className={`${btn} border-b border-white/10`}><Minus className="h-3.5 w-3.5" /></button>
      <button onClick={() => fitView({ padding: 0.15, duration: 250 })} title="Recadrer" className={btn}><Maximize className="h-3.5 w-3.5" /></button>
    </Panel>
  )
}

/** Vue « Données » : diagramme ERD des collections Firestore (tous les champs, PK/FK,
 *  relations + cardinalités). Double-clic sur une table interrogeable → panneau de
 *  données live. Positions des tables persistées par utilisateur (Firestore). */
export function DataModelDiagram() {
  return (
    <ReactFlowProvider>
      <DataModelDiagramInner />
    </ReactFlowProvider>
  )
}

function DataModelDiagramInner() {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const initial = useMemo(() => buildDiagram(), [])
  const [nodes, setNodes] = useState<Node[]>(initial.nodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [schema, setSchema] = useState<{ tableId: string; field?: string } | null>(null)
  const { layout, saveLayout } = useDiagramLayout()
  const { fitView } = useReactFlow()

  // Applique les positions sauvegardées (Firestore) une fois chargées.
  useEffect(() => {
    if (!layout) return
    setNodes((prev) => prev.map((n) => (layout[n.id] ? { ...n, position: layout[n.id] } : n)))
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  }, [layout, fitView])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)),
    [],
  )

  // Persiste les positions après un déplacement de table.
  const onNodeDragStop = useCallback(() => {
    setNodes((prev) => { saveLayout(prev); return prev })
  }, [saveLayout])

  // Clic simple sur une table → panneau schéma (droite). Double-clic → données (bas).
  const openSchema = useCallback((tableId: string, field?: string) => setSchema({ tableId, field }), [])
  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSchema({ tableId: (node.data as TableNodeData).table.id })
  }, [])
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    const { table } = node.data as TableNodeData
    if (table.query) setSelectedId(table.id)
  }, [])

  // Recadre le diagramme sur une table (suivi d'une clé étrangère depuis le panneau schéma).
  const focusTable = useCallback(
    (id: string) => {
      setSchema({ tableId: id })
      fitView({ nodes: [{ id }], padding: 0.6, duration: 350, maxZoom: 1.2 } as FitViewOptions)
    },
    [fitView],
  )

  const selectedTable = selectedId ? TABLES.find((t) => t.id === selectedId) ?? null : null
  const schemaTable = schema ? TABLES.find((t) => t.id === schema.tableId) ?? null : null
  const highlightId = schema?.tableId ?? selectedId
  const styledNodes = useMemo(
    () => nodes.map((n) => (n.id === highlightId ? { ...n, selected: true } : { ...n, selected: false })),
    [nodes, highlightId],
  )

  return (
    <SchemaPanelProvider value={openSchema}>
    <div className="relative flex h-full min-h-[540px] flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-well">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <Database className="h-5 w-5 text-indigo-400" />
        <span className="text-[15px] font-bold text-white">{t('dg.dataModel')}</span>
        <span className="ml-auto hidden items-center rounded-lg border border-white/10 bg-surface px-3 py-1.5 text-[12px] text-white/40 md:flex">
          {t('dataModelDiagram.doubleClickA')}
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
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
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

        {schemaTable && (
          <TableSchemaPanel
            table={schemaTable}
            highlightField={schema?.field}
            onClose={() => setSchema(null)}
            onFocusTable={focusTable}
            onShowData={(id) => setSelectedId(id)}
          />
        )}

        {selectedTable && (
          <TableDataPanel table={selectedTable} onClose={() => setSelectedId(null)} rightInset={schemaTable ? 330 : 0} />
        )}
      </div>
    </div>
    </SchemaPanelProvider>
  )
}
