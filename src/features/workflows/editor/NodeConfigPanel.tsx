// src/features/workflows/editor/NodeConfigPanel.tsx
import { useStore } from '@xyflow/react'
import { ArrowRight, ArrowLeft, X, Link2, Trash2 } from 'lucide-react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { ConfigFieldRenderer } from './configFields'
import type { Workflow, WorkflowNode, WorkflowEdge } from '../types'

/**
 * Remonte récursivement les edges entrants pour collecter les colonnes
 * exposées par les nodes upstream (CSV csvSummary, IDML idmlSummary, etc.).
 * Permet à l'autocomplétion de proposer les bons noms de variables.
 */
function collectUpstreamColumns(wf: Workflow, nodeId: string, visited = new Set<string>()): string[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)

  const cols = new Set<string>()
  const incomingEdges = wf.edges.filter((e) => e.target === nodeId)
  for (const e of incomingEdges) {
    const src = wf.nodes.find((n) => n.id === e.source)
    if (!src) continue
    const cfg = src.config as Record<string, unknown> | undefined
    // Cas Upload : csvSummary.columns directement disponible
    const csv = cfg?.csvSummary as { columns?: string[] } | undefined
    if (csv?.columns?.length) {
      for (const c of csv.columns) cols.add(c)
    }
    // Sinon, remonte d'un cran (cas Pipe, Loop each, etc.)
    if (!csv?.columns?.length) {
      for (const c of collectUpstreamColumns(wf, src.id, visited)) cols.add(c)
    }
  }
  return Array.from(cols)
}

interface ConnectionsPanelProps {
  node: WorkflowNode
  wf: Workflow
  onRemoveEdge: (edgeId: string) => void
}

function ConnectionsPanel({ node, wf, onRemoveEdge }: ConnectionsPanelProps) {
  const incoming = wf.edges.filter((e) => e.target === node.id)
  const outgoing = wf.edges.filter((e) => e.source === node.id)

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="pt-3 mt-3 border-t border-neutral-800">
        <h4 className="text-xs uppercase text-neutral-500 font-semibold mb-2">Connexions</h4>
        <p className="text-[11px] text-neutral-600 italic">
          Aucune connexion. Tire un câble depuis un port d'un autre node.
        </p>
      </div>
    )
  }

  const labelFor = (id: string) => {
    const n = wf.nodes.find((x) => x.id === id)
    if (!n) return id.slice(0, 8)
    return nodeRegistry.get(n.type)?.label ?? n.type
  }

  const renderEdge = (e: WorkflowEdge, dir: 'in' | 'out') => {
    const otherId = dir === 'in' ? e.source : e.target
    const otherLabel = labelFor(otherId)
    const localPort = dir === 'in' ? e.targetHandle : e.sourceHandle
    const otherPort = dir === 'in' ? e.sourceHandle : e.targetHandle
    const Icon = dir === 'in' ? ArrowLeft : ArrowRight

    return (
      <div
        key={e.id}
        className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-[#161616] border border-neutral-800 hover:border-neutral-700 transition-colors"
      >
        <Icon className="w-3 h-3 text-neutral-500 shrink-0" />
        <div className="flex-1 min-w-0 text-[11px] leading-tight">
          <div className="text-white truncate" title={otherLabel}>
            {otherLabel}
          </div>
          <div className="text-neutral-500 font-mono text-[10px] truncate">
            {dir === 'in' ? (
              <>
                <span className="text-emerald-400/80">{otherPort}</span>
                <span className="text-neutral-600 mx-1">→</span>
                <span className="text-cyan-400/80">{localPort}</span>
              </>
            ) : (
              <>
                <span className="text-cyan-400/80">{localPort}</span>
                <span className="text-neutral-600 mx-1">→</span>
                <span className="text-emerald-400/80">{otherPort}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemoveEdge(e.id)}
          className="shrink-0 p-1 rounded text-neutral-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Supprimer la connexion"
          aria-label="Supprimer la connexion"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="pt-3 mt-3 border-t border-neutral-800 space-y-3">
      <h4 className="text-xs uppercase text-neutral-500 font-semibold">Connexions</h4>
      {incoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-neutral-600 tracking-wider">
            Entrantes ({incoming.length})
          </p>
          <div className="space-y-1">{incoming.map((e) => renderEdge(e, 'in'))}</div>
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-neutral-600 tracking-wider">
            Sortantes ({outgoing.length})
          </p>
          <div className="space-y-1">{outgoing.map((e) => renderEdge(e, 'out'))}</div>
        </div>
      )}
    </div>
  )
}

interface EdgeDetailPanelProps {
  edge: WorkflowEdge
  wf: Workflow
  onRemove: () => void
}

function EdgeDetailPanel({ edge, wf, onRemove }: EdgeDetailPanelProps) {
  const sourceNode = wf.nodes.find((n) => n.id === edge.source)
  const targetNode = wf.nodes.find((n) => n.id === edge.target)
  const sourceLabel = sourceNode
    ? nodeRegistry.get(sourceNode.type)?.label ?? sourceNode.type
    : edge.source
  const targetLabel = targetNode
    ? nodeRegistry.get(targetNode.type)?.label ?? targetNode.type
    : edge.target
  const sourceSpec = sourceNode ? nodeRegistry.get(sourceNode.type) : undefined
  const targetSpec = targetNode ? nodeRegistry.get(targetNode.type) : undefined
  const sourcePortType = sourceSpec?.outputs.find((p) => p.name === edge.sourceHandle)?.type
  const targetPortType = targetSpec?.inputs.find((p) => p.name === edge.targetHandle)?.type

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-violet-400" />
        <div className="text-sm font-medium text-white">Connexion</div>
      </div>

      {/* Source */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-neutral-600 tracking-wider">Source</p>
        <div className="px-2 py-2 rounded-md bg-[#161616] border border-neutral-800">
          <div className="text-[12px] text-white truncate" title={sourceLabel}>
            {sourceLabel}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
            <span className="text-emerald-400/80">{edge.sourceHandle}</span>
            {sourcePortType && (
              <span className="text-neutral-600">
                : <span className="text-neutral-500">{sourcePortType}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Flèche descendante visuelle */}
      <div className="flex justify-center">
        <ArrowRight className="w-4 h-4 text-neutral-600 rotate-90" />
      </div>

      {/* Target */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-neutral-600 tracking-wider">Cible</p>
        <div className="px-2 py-2 rounded-md bg-[#161616] border border-neutral-800">
          <div className="text-[12px] text-white truncate" title={targetLabel}>
            {targetLabel}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
            <span className="text-cyan-400/80">{edge.targetHandle}</span>
            {targetPortType && (
              <span className="text-neutral-600">
                : <span className="text-neutral-500">{targetPortType}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 mt-2 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Supprimer la connexion
      </button>

      {sourcePortType && targetPortType && sourcePortType !== targetPortType && (
        <p className="text-[10px] text-amber-400/80 leading-snug">
          Type source <code className="text-amber-300">{sourcePortType}</code> ≠ cible{' '}
          <code className="text-amber-300">{targetPortType}</code>. Conversion implicite via{' '}
          <code>any</code>.
        </p>
      )}
    </div>
  )
}

export function NodeConfigPanel() {
  const selectedId = useStore((s) => {
    for (const n of s.nodeLookup.values()) {
      if ((n as any).selected) return (n as { id: string }).id
    }
    return undefined
  })
  const selectedEdgeId = useStore((s) => {
    const lookup = (s as any).edgeLookup as Map<string, any> | undefined
    if (!lookup) return undefined
    for (const [, e] of lookup) {
      if (e.selected) return e.id as string
    }
    return undefined
  })
  const wf = useWorkflowStore((s) => s.current)
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const removeEdge = useWorkflowStore((s) => s.removeEdge)

  const node = wf?.nodes.find((n) => n.id === selectedId)
  const spec = node ? nodeRegistry.get(node.type) : undefined
  const selectedEdge = wf?.edges.find((e) => e.id === selectedEdgeId)
  const availableColumns = wf && node ? collectUpstreamColumns(wf, node.id) : []

  // Priorité au node sélectionné si les deux le sont (cas peu probable).
  const showEdge = !node && !!selectedEdge

  return (
    <aside className="w-72 border-l border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-4">
      <h3 className="text-xs uppercase text-neutral-500 font-semibold mb-3">
        {showEdge ? 'Connexion' : 'Configuration'}
      </h3>
      {showEdge && wf && selectedEdge ? (
        <EdgeDetailPanel
          edge={selectedEdge}
          wf={wf}
          onRemove={() => removeEdge(selectedEdge.id)}
        />
      ) : !node || !spec ? (
        <p className="text-sm text-neutral-500">
          Sélectionnez un node ou une connexion pour voir ses détails.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-white">{spec.label}</div>
          {spec.ConfigComponent ? (
            <spec.ConfigComponent
              config={node.config as never}
              onChange={(c) => upsertNode({ ...node, config: c })}
              availableColumns={availableColumns}
            />
          ) : (
            spec.configSchema.map((f) => (
              <label key={f.name} className="block">
                <span className="text-xs text-neutral-400 mb-1 block">{f.label}</span>
                <ConfigFieldRenderer
                  field={f}
                  value={(node.config as Record<string, unknown>)[f.name]}
                  onChange={(v) =>
                    upsertNode({
                      ...node,
                      config: { ...(node.config as Record<string, unknown>), [f.name]: v },
                    })
                  }
                />
                {f.help ? <span className="text-[11px] text-neutral-600 mt-1 block">{f.help}</span> : null}
              </label>
            ))
          )}
          {wf && <ConnectionsPanel node={node} wf={wf} onRemoveEdge={removeEdge} />}
        </div>
      )}
    </aside>
  )
}
