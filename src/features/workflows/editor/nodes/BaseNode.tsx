// src/features/workflows/editor/nodes/BaseNode.tsx
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRunContext } from '../../runtime/runContext'
import { nodeRegistry } from '../../registry'
import { CheckCircle2, Circle, Loader2, AlertCircle, MinusCircle } from 'lucide-react'

const STATUS_ICON = {
  pending: <Circle className="w-3 h-3 text-neutral-600" />,
  running: <Loader2 className="w-3 h-3 text-indigo-400 animate-spin" />,
  success: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  error: <AlertCircle className="w-3 h-3 text-red-500" />,
  skipped: <MinusCircle className="w-3 h-3 text-neutral-500" />,
}

export function BaseNode({ id, data }: NodeProps) {
  const nodeType = (data as any).type as string
  const spec = nodeRegistry.get(nodeType)
  const state = useRunContext((s) => s.nodeStates[id])
  const Icon = spec?.icon

  if (!spec) {
    return <div className="bg-red-900 text-white text-xs p-2 rounded">Unknown: {nodeType}</div>
  }

  return (
    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-lg min-w-[180px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        {Icon ? <Icon className="w-4 h-4 text-indigo-400" /> : null}
        <span className="text-sm text-white flex-1">{spec.label}</span>
        {STATUS_ICON[state?.status ?? 'pending']}
      </div>
      <div className="px-3 py-2 text-xs text-neutral-500">
        {spec.inputs.map((p) => (
          <div key={p.name} className="relative py-1">
            <Handle
              type="target"
              id={p.name}
              position={Position.Left}
              className="!bg-indigo-500 !w-2 !h-2"
            />
            <span className="ml-2">{p.name}</span>
          </div>
        ))}
        {spec.outputs.map((p) => (
          <div key={p.name} className="relative py-1 text-right">
            <span className="mr-2">{p.name}</span>
            <Handle
              type="source"
              id={p.name}
              position={Position.Right}
              className="!bg-indigo-500 !w-2 !h-2"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
