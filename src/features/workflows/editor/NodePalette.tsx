// src/features/workflows/editor/NodePalette.tsx
import type { DragEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import type { NodeSpec } from '../types'
import { WORKFLOW_DRAG_TYPE } from './WorkflowEditor'

const CATEGORY_LABEL: Record<NodeSpec['category'], string> = {
  import: 'Import',
  enrichment: 'Enrichissement',
  persistence: 'Sauvegarde',
  export: 'Export',
  utility: 'Utilitaires',
}

const CATEGORY_ACCENT: Record<NodeSpec['category'], string> = {
  import: 'text-amber-300 hover:bg-amber-500/10 border-amber-500/20',
  enrichment: 'text-violet-300 hover:bg-violet-500/10 border-violet-500/20',
  persistence: 'text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/20',
  export: 'text-sky-300 hover:bg-sky-500/10 border-sky-500/20',
  utility: 'text-neutral-300 hover:bg-neutral-500/10 border-neutral-600/20',
}

export function NodePalette() {
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const rf = useReactFlow()

  const grouped = nodeRegistry.list().reduce<Record<string, NodeSpec[]>>((acc, spec) => {
    ;(acc[spec.category] ??= []).push(spec)
    return acc
  }, {})

  const spawn = (spec: NodeSpec) => {
    const center = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    upsertNode({
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: spec.type,
      position: center,
      config: spec.defaultConfig,
    })
  }

  const onDragStart = (event: DragEvent, spec: NodeSpec) => {
    event.dataTransfer.setData(WORKFLOW_DRAG_TYPE, spec.type)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className="w-56 border-r border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-3">
      <h3 className="text-[10px] uppercase text-neutral-500 font-semibold mb-3 tracking-wider">
        Palette
      </h3>
      <p className="text-[10px] text-neutral-600 mb-3 leading-tight">
        Glisser sur le canvas, ou cliquer pour spawn au centre.
      </p>
      {Object.entries(grouped).map(([cat, specs]) => (
        <section key={cat} className="mb-4">
          <h4 className="text-[10px] text-neutral-400 mb-2 uppercase tracking-wider">
            {CATEGORY_LABEL[cat as NodeSpec['category']]}
          </h4>
          <ul className="space-y-1">
            {specs.map((spec) => {
              const Icon = spec.icon
              const accent = CATEGORY_ACCENT[spec.category]
              return (
                <li key={spec.type}>
                  <button
                    onClick={() => spawn(spec)}
                    draggable
                    onDragStart={(e) => onDragStart(e, spec)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left bg-[#161616] border ${accent} transition-colors cursor-grab active:cursor-grabbing`}
                    title={spec.description}
                  >
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${accent.split(' ')[0]}`} />
                    <span className="truncate text-white/90">{spec.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </aside>
  )
}
