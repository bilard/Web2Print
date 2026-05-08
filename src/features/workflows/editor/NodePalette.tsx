// src/features/workflows/editor/NodePalette.tsx
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import type { NodeSpec } from '../types'

const CATEGORY_LABEL: Record<NodeSpec['category'], string> = {
  import: 'Import',
  enrichment: 'Enrichissement',
  persistence: 'Sauvegarde',
  export: 'Export',
  utility: 'Utilitaires',
}

export function NodePalette() {
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const rf = useReactFlow()

  const grouped = nodeRegistry.list().reduce<Record<string, NodeSpec[]>>((acc, spec) => {
    ;(acc[spec.category] ??= []).push(spec)
    return acc
  }, {})

  const spawn = (spec: NodeSpec) => {
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    upsertNode({
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: spec.type,
      position: center,
      config: spec.defaultConfig,
    })
  }

  return (
    <aside className="w-56 border-r border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-3">
      <h3 className="text-xs uppercase text-neutral-500 font-semibold mb-3">Palette</h3>
      {Object.entries(grouped).map(([cat, specs]) => (
        <section key={cat} className="mb-4">
          <h4 className="text-xs text-neutral-400 mb-2">{CATEGORY_LABEL[cat as NodeSpec['category']]}</h4>
          <ul className="space-y-1">
            {specs.map((spec) => {
              const Icon = spec.icon
              return (
                <li key={spec.type}>
                  <button
                    onClick={() => spawn(spec)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left bg-[#1a1a1a] hover:bg-[#222] border border-neutral-800"
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{spec.label}</span>
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
