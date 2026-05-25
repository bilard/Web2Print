// src/features/workflows/promptToFlow/PromptToFlowPreview.tsx
import { AlertTriangle, ArrowDown } from 'lucide-react'
import type { ValidatedGraph } from './types'

export function PromptToFlowPreview({ graph }: { graph: ValidatedGraph }) {
  const errors = graph.issues.filter((i) => i.level === 'error')
  const warnings = graph.issues.filter((i) => i.level === 'warning')
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-white">{graph.title || 'Workflow généré'}</p>
        {graph.summary && <p className="text-xs text-white/40 mt-0.5">{graph.summary}</p>}
      </div>

      <div className="rounded-md border border-neutral-800 bg-[#0f0f0f] p-3 space-y-1.5 max-h-64 overflow-auto">
        {graph.nodes.map((n, i) => (
          <div key={n.id}>
            {i > 0 && <ArrowDown className="w-3 h-3 text-white/20 mx-auto my-0.5" />}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/30 tabular-nums">{i + 1}.</span>
              <span className="text-white/80">{n.type}</span>
            </div>
          </div>
        ))}
        <p className="text-[10px] text-white/30 pt-1">{graph.edges.length} connexion(s)</p>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 space-y-1">
          {errors.map((iss, k) => (
            <p key={`e${k}`} className="text-[11px] text-red-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {iss.message}
            </p>
          ))}
          {warnings.map((iss, k) => (
            <p key={`w${k}`} className="text-[11px] text-amber-300 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {iss.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
