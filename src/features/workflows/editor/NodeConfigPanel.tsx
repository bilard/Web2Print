// src/features/workflows/editor/NodeConfigPanel.tsx
import { useStore } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import { ConfigFieldRenderer } from './configFields'

export function NodeConfigPanel() {
  const selectedId = useStore((s) => {
    for (const n of s.nodeLookup.values()) {
      if ((n as any).selected) return (n as { id: string }).id
    }
    return undefined
  })
  const wf = useWorkflowStore((s) => s.current)
  const upsertNode = useWorkflowStore((s) => s.upsertNode)

  const node = wf?.nodes.find((n) => n.id === selectedId)
  const spec = node ? nodeRegistry.get(node.type) : undefined

  return (
    <aside className="w-72 border-l border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-4">
      <h3 className="text-xs uppercase text-neutral-500 font-semibold mb-3">Configuration</h3>
      {!node || !spec ? (
        <p className="text-sm text-neutral-500">Sélectionnez un node pour voir ses paramètres.</p>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-medium text-white">{spec.label}</div>
          {spec.ConfigComponent ? (
            <spec.ConfigComponent
              config={node.config as never}
              onChange={(c) => upsertNode({ ...node, config: c })}
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
        </div>
      )}
    </aside>
  )
}
