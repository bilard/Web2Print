// src/features/workflows/editor/nodes/BaseNode.tsx
import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunContext } from '../../runtime/runContext'
import { nodeRegistry } from '../../registry'
import { CheckCircle2, Loader2, AlertCircle, MinusCircle } from 'lucide-react'

const STATUS_BORDER: Record<string, string> = {
  pending: 'border-neutral-700',
  running: 'border-indigo-500 ring-1 ring-indigo-500/50',
  success: 'border-emerald-600/70',
  error: 'border-red-500',
  skipped: 'border-neutral-700 opacity-60',
}

const STATUS_BADGE: Record<string, ReactNode> = {
  pending: null,
  running: <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />,
  success: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  error: <AlertCircle className="w-3 h-3 text-red-500" />,
  skipped: <MinusCircle className="w-3 h-3 text-neutral-500" />,
}

const HANDLE_CLS =
  '!w-2 !h-2 !border !border-[#1a1a1a] !bg-indigo-500 hover:!bg-indigo-400 transition-colors'

export function BaseNode({ id, data, selected }: NodeProps) {
  const nodeType = (data as { type?: string }).type
  const spec = nodeType ? nodeRegistry.get(nodeType) : undefined
  const status = useRunContext((s) => s.nodeStates[id]?.status ?? 'pending')

  if (!spec) {
    return (
      <div className="bg-red-950 border border-red-700 text-red-300 text-[11px] px-2 py-1 rounded">
        Unknown: {nodeType ?? 'no-type'}
      </div>
    )
  }

  const Icon = spec.icon
  const inputs = spec.inputs ?? []
  const outputs = spec.outputs ?? []
  const portRows = Math.max(inputs.length, outputs.length)
  const selectionCls = selected
    ? 'ring-2 ring-indigo-500/70 border-indigo-500'
    : STATUS_BORDER[status]

  return (
    <div
      className={`relative bg-[#1a1a1a] border ${selectionCls} rounded-md shadow-md text-white min-w-[140px] max-w-[180px] transition-colors`}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-neutral-800/80">
        <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-medium truncate flex-1">{spec.label}</span>
        {STATUS_BADGE[status]}
      </div>

      <div className="py-1">
        {Array.from({ length: portRows }).map((_, i) => {
          const inp = inputs[i]
          const out = outputs[i]
          return (
            <div
              key={i}
              className="relative flex items-center justify-between text-[10px] text-neutral-400 px-2 h-5"
            >
              {inp ? (
                <>
                  <Handle
                    type="target"
                    id={inp.name}
                    position={Position.Left}
                    className={HANDLE_CLS}
                  />
                  <span className="ml-1 truncate">{inp.name}</span>
                </>
              ) : (
                <span />
              )}
              {out ? (
                <>
                  <span className="mr-1 truncate text-right">{out.name}</span>
                  <Handle
                    type="source"
                    id={out.name}
                    position={Position.Right}
                    className={HANDLE_CLS}
                  />
                </>
              ) : (
                <span />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
