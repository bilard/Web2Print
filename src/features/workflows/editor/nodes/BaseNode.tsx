// src/features/workflows/editor/nodes/BaseNode.tsx
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunContext } from '../../runtime/runContext'
import { nodeRegistry } from '../../registry'
import { CheckCircle2, Loader2, AlertCircle, MinusCircle, Download } from 'lucide-react'
import type { NodeSpec } from '../../types'

interface ExportPayload {
  url: string
  mime?: string
  filename: string
}

function findExportResult(outputs: Record<string, unknown> | undefined): ExportPayload | null {
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

function triggerDownload(payload: ExportPayload): void {
  const a = document.createElement('a')
  a.href = payload.url
  a.download = payload.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

interface CategoryStyle {
  ring: string
  icon: string
  bg: string
  border: string
  glow: string
}

const CATEGORY_STYLES: Record<NodeSpec['category'], CategoryStyle> = {
  import: {
    ring: 'ring-amber-500/40',
    icon: 'text-amber-300',
    bg: 'bg-gradient-to-br from-amber-500/15 to-amber-700/15',
    border: 'border-amber-500/40',
    glow: 'shadow-amber-500/10',
  },
  enrichment: {
    ring: 'ring-violet-500/40',
    icon: 'text-violet-300',
    bg: 'bg-gradient-to-br from-violet-500/15 to-violet-700/15',
    border: 'border-violet-500/40',
    glow: 'shadow-violet-500/10',
  },
  persistence: {
    ring: 'ring-emerald-500/40',
    icon: 'text-emerald-300',
    bg: 'bg-gradient-to-br from-emerald-500/15 to-emerald-700/15',
    border: 'border-emerald-500/40',
    glow: 'shadow-emerald-500/10',
  },
  export: {
    ring: 'ring-sky-500/40',
    icon: 'text-sky-300',
    bg: 'bg-gradient-to-br from-sky-500/15 to-sky-700/15',
    border: 'border-sky-500/40',
    glow: 'shadow-sky-500/10',
  },
  utility: {
    ring: 'ring-neutral-500/40',
    icon: 'text-neutral-300',
    bg: 'bg-gradient-to-br from-neutral-600/15 to-neutral-800/15',
    border: 'border-neutral-600/40',
    glow: 'shadow-neutral-500/10',
  },
}

const STATUS_DOT: Record<string, ReactNode> = {
  pending: null,
  running: (
    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0f0f0f] border border-indigo-500 flex items-center justify-center">
      <Loader2 className="w-2.5 h-2.5 text-indigo-400 animate-spin" />
    </div>
  ),
  success: (
    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0f0f0f] border border-emerald-500 flex items-center justify-center">
      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
    </div>
  ),
  error: (
    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0f0f0f] border border-red-500 flex items-center justify-center">
      <AlertCircle className="w-2.5 h-2.5 text-red-400" />
    </div>
  ),
  skipped: (
    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0f0f0f] border border-neutral-600 flex items-center justify-center">
      <MinusCircle className="w-2.5 h-2.5 text-neutral-500" />
    </div>
  ),
}

const HANDLE_BASE =
  '!w-2.5 !h-2.5 !border-2 !border-[#0f0f0f] hover:!w-3 hover:!h-3 transition-all'

export function BaseNode({ id, data, selected }: NodeProps) {
  const nodeType = (data as { type?: string }).type
  const spec = nodeType ? nodeRegistry.get(nodeType) : undefined
  const status = useRunContext((s) => s.nodeStates[id]?.status ?? 'pending')
  const runOutputs = useRunContext((s) => s.nodeStates[id]?.outputs)
  const exportResult = useMemo(
    () => (status === 'success' ? findExportResult(runOutputs) : null),
    [status, runOutputs],
  )

  if (!spec) {
    return (
      <div className="bg-red-950 border border-red-700 text-red-300 text-[11px] px-2 py-1 rounded">
        Unknown: {nodeType ?? 'no-type'}
      </div>
    )
  }

  const Icon = spec.icon
  const cat = CATEGORY_STYLES[spec.category]
  const inputs = spec.inputs ?? []
  const outputs = spec.outputs ?? []
  const portRows = Math.max(inputs.length, outputs.length, 1)

  const ringCls = selected
    ? `ring-2 ${cat.ring.replace('/40', '/80')}`
    : status === 'running'
      ? 'ring-2 ring-indigo-500/60 animate-pulse'
      : status === 'error'
        ? 'ring-2 ring-red-500/60'
        : 'ring-1 ring-white/5'

  return (
    <div className={`relative group`}>
      {/* Card */}
      <div
        className={`relative w-[130px] rounded-xl ${cat.bg} backdrop-blur-sm border ${cat.border} ${ringCls} shadow-lg ${cat.glow} transition-all group-hover:scale-[1.02]`}
      >
        {/* Icon block */}
        <div className="flex flex-col items-center justify-center px-3 pt-4 pb-2">
          <div
            className={`w-12 h-12 rounded-xl ${cat.bg} border ${cat.border} flex items-center justify-center shadow-inner`}
          >
            <Icon className={`w-6 h-6 ${cat.icon}`} aria-hidden="true" />
          </div>
          <span className="mt-2 text-[11px] font-medium text-white text-center leading-tight">
            {spec.label}
          </span>

          {/* Download button — appears when an export-result is available */}
          {exportResult ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                triggerDownload(exportResult)
              }}
              className="mt-2 flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[10px] text-emerald-200 transition-colors"
              title={`Télécharger ${exportResult.filename}`}
            >
              <Download className="w-3 h-3" />
              Télécharger
            </button>
          ) : null}
        </div>

        {/* Status dot */}
        {STATUS_DOT[status]}
      </div>

      {/* Ports — positioned absolutely on the card edges */}
      {Array.from({ length: portRows }).map((_, i) => {
        const inp = inputs[i]
        const out = outputs[i]
        const top = portRows === 1 ? '50%' : `${30 + (i / Math.max(portRows - 1, 1)) * 40}%`
        return (
          <div key={i}>
            {inp ? (
              <Handle
                type="target"
                id={inp.name}
                position={Position.Left}
                style={{ top }}
                className={`${HANDLE_BASE} !bg-indigo-400`}
              />
            ) : null}
            {out ? (
              <Handle
                type="source"
                id={out.name}
                position={Position.Right}
                style={{ top }}
                className={`${HANDLE_BASE} !bg-indigo-400`}
              />
            ) : null}
          </div>
        )
      })}

      {/* Port labels — visible on hover */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute inset-0">
        {inputs.map((p, i) => {
          const top = inputs.length === 1 ? '50%' : `${30 + (i / Math.max(inputs.length - 1, 1)) * 40}%`
          return (
            <span
              key={`in-${p.name}`}
              className="absolute right-full mr-2 text-[10px] text-neutral-400 whitespace-nowrap -translate-y-1/2"
              style={{ top }}
            >
              {p.name}
            </span>
          )
        })}
        {outputs.map((p, i) => {
          const top = outputs.length === 1 ? '50%' : `${30 + (i / Math.max(outputs.length - 1, 1)) * 40}%`
          return (
            <span
              key={`out-${p.name}`}
              className="absolute left-full ml-2 text-[10px] text-neutral-400 whitespace-nowrap -translate-y-1/2"
              style={{ top }}
            >
              {p.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}
