// src/features/workflows/editor/RunPanel.tsx
import { useState } from 'react'
import { Download } from 'lucide-react'
import { useRunContext } from '../runtime/runContext'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'

interface ExportPayload {
  url: string
  mime?: string
  filename: string
}

function findExportResult(
  outputs: Record<string, unknown> | undefined,
): ExportPayload | null {
  if (!outputs) return null
  for (const v of Object.values(outputs)) {
    if (
      v &&
      typeof v === 'object' &&
      'url' in v &&
      'filename' in v &&
      typeof (v as ExportPayload).url === 'string' &&
      typeof (v as ExportPayload).filename === 'string'
    ) {
      return v as ExportPayload
    }
  }
  return null
}

function downloadExport(payload: ExportPayload) {
  const a = document.createElement('a')
  a.href = payload.url
  a.download = payload.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

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
            const exportResult = st.status === 'success' ? findExportResult(st.outputs) : null
            return (
              <div key={id} className="bg-[#1a1a1a] rounded p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-300 truncate">
                    {spec?.label ?? node?.type ?? id} <span className="text-neutral-600">· {st.status}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {exportResult ? (
                      <button
                        type="button"
                        onClick={() => downloadExport(exportResult)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200"
                        title={`Télécharger ${exportResult.filename}`}
                      >
                        <Download className="w-3 h-3" />
                        {exportResult.filename}
                      </button>
                    ) : null}
                    {st.durationMs ? <span className="text-neutral-600">{st.durationMs}ms</span> : null}
                  </div>
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
