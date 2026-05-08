// src/features/workflows/editor/RunPanel.tsx
import { useState } from 'react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'

export function RunPanel() {
  const states = useRunContext((s) => s.nodeStates)
  const wf = useWorkflowStore((s) => s.current)
  const [open, setOpen] = useState(true)
  const entries = Object.entries(states)

  return (
    <div className="border-t border-neutral-800 bg-[#0f0f0f] text-sm">
      <button
        className="w-full px-4 py-1.5 text-xs uppercase text-neutral-500 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Run logs ({entries.length} nodes)
      </button>
      {open ? (
        <div className="max-h-56 overflow-y-auto px-4 pb-3 space-y-2">
          {entries.map(([id, st]) => {
            const node = wf?.nodes.find((n) => n.id === id)
            const spec = node ? nodeRegistry.get(node.type) : undefined
            return (
              <div key={id} className="bg-[#1a1a1a] rounded p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">
                    {spec?.label ?? node?.type ?? id} <span className="text-neutral-600">· {st.status}</span>
                  </span>
                  {st.durationMs ? <span className="text-neutral-600">{st.durationMs}ms</span> : null}
                </div>
                {st.error ? <div className="text-red-400 mt-1">{st.error}</div> : null}
                {st.logs.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.level === 'error'
                        ? 'text-red-400'
                        : l.level === 'warn'
                        ? 'text-amber-400'
                        : 'text-neutral-400'
                    }
                  >
                    · {l.msg}
                  </div>
                ))}
                {st.outputs ? (
                  <details className="mt-1">
                    <summary className="text-neutral-500 cursor-pointer">Outputs</summary>
                    <pre className="text-[10px] text-neutral-400 overflow-x-auto">
                      {JSON.stringify(st.outputs, null, 2).slice(0, 2000)}
                    </pre>
                  </details>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
