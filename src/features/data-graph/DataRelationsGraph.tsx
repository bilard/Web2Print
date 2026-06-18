// src/features/data-graph/DataRelationsGraph.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Panel, applyNodeChanges,
  type Node, type NodeChange, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize, Network } from 'lucide-react'
import { useThemeStore } from '@/stores/theme.store'
import { useDataCounts } from './useDataCounts'
import { buildDataGraph, DOMAIN_HEX } from './dataModel'
import { EntityNode } from './EntityNode'

const nodeTypes = { entity: EntityNode }

const LEGEND: { domain: keyof typeof DOMAIN_HEX; label: string }[] = [
  { domain: 'pim', label: 'PIM / Catalogue' },
  { domain: 'bdd', label: 'Bases de données' },
  { domain: 'flow', label: 'Workflows' },
]

/** Vue « Données » : graphe de relations interactif (réseau de nœuds) des entités du
 *  système et de leurs liens. Lecture seule — nœuds déplaçables, zoom/pan, recadrage. */
export function DataRelationsGraph() {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const counts = useDataCounts()
  const built = useMemo(() => buildDataGraph(counts), [counts])

  // État local : positions préservées au fil des mises à jour de compteurs.
  const [nodes, setNodes] = useState<Node[]>(built.nodes)
  useEffect(() => {
    setNodes((prev) => built.nodes.map((n) => {
      const existing = prev.find((p) => p.id === n.id)
      return existing ? { ...n, position: existing.position } : n
    }))
  }, [built])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((prev) => applyNodeChanges(changes, prev)),
    [],
  )

  const rfRef = useRef<ReactFlowInstance | null>(null)
  const fit = useCallback(() => rfRef.current?.fitView({ padding: 0.18, duration: 250 }), [])

  return (
    <div className="h-full min-h-[480px] overflow-hidden rounded-xl border border-white/[0.06] bg-well">
      <ReactFlow
        nodes={nodes}
        edges={built.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onInit={(rf) => { rfRef.current = rf }}
        nodesConnectable={false}
        elementsSelectable={false}
        minZoom={0.3}
        maxZoom={1.8}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={isLight ? '#d4d4d8' : '#1f1f1f'} gap={22} size={1} />

        <Panel position="top-left" className="!m-2 rounded-lg border border-white/10 bg-well/95 px-3 py-2 backdrop-blur">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-white/80">
            <Network className="h-3.5 w-3.5 text-cyan-400" /> Relations des données
          </div>
          <div className="flex flex-col gap-1">
            {LEGEND.map((l) => (
              <div key={l.domain} className="flex items-center gap-1.5 text-[10px] text-white/45">
                <span className="h-2 w-2 rounded-full" style={{ background: DOMAIN_HEX[l.domain] }} />
                {l.label}
              </div>
            ))}
          </div>
          <p className="mt-1.5 max-w-[150px] text-[9px] leading-snug text-white/30">
            Compteurs = éléments chargés en mémoire, pas des totaux globaux.
          </p>
        </Panel>

        <Panel position="bottom-left" className="!m-2">
          <button
            onClick={fit}
            title="Recadrer"
            className="rounded-lg border border-white/10 bg-well/95 p-1.5 text-white/50 backdrop-blur transition-colors hover:text-white"
          >
            <Maximize className="h-3.5 w-3.5" />
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
