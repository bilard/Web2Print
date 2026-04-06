import { useState } from 'react'
import { Link2, X, Type, Hash, FunctionSquare } from 'lucide-react'
import { useMergeStore } from '@/stores/merge.store'
import { useSegmentBinding } from '@/features/editor/useSegmentBinding'
import type { TextSegment } from '@/features/editor/useTextSegments'

interface Props {
  segment: TextSegment
  index: number
  objectId: string
}

export function TextSegmentRow({ segment, objectId }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const columns = useMergeStore((s) => s.columns)
  const isConnected = useMergeStore((s) => s.isConnected)
  const { bind, unbind } = useSegmentBinding()

  const raw = segment.text.replace(/\n/g, '↵')
  const preview = raw.slice(0, 20) + (raw.length > 20 ? '…' : '')

  const handleBind = (fieldKey: string) => {
    bind(objectId, segment, fieldKey)
    setPickerOpen(false)
  }

  if (segment.isPlaceholder) {
    // Resolve column label from store (fallback to variable key if disconnected)
    const col = columns.find((c) => c.key === segment.variableKey)
    const label = col?.label ?? segment.variableKey
    const isFormula = col?.fieldType === 'formula'
    const FieldIcon = isFormula ? FunctionSquare : col?.fieldType === 'number' ? Hash : Type

    return (
      <div className="flex items-center gap-1.5 px-2 py-1 pl-9 bg-indigo-500/5 border-l-2 border-indigo-500/30 group">
        <div className="w-3 border-b border-indigo-500/20 shrink-0 -ml-1" />
        <Link2 className="w-3 h-3 text-indigo-400/60 shrink-0" />
        <FieldIcon className="w-3 h-3 text-indigo-300/50 shrink-0" />
        {/* Show human-readable label, not the raw key */}
        <span className="text-[11px] text-indigo-200 flex-1 truncate font-medium">
          {label}
        </span>
        <button
          onClick={() => unbind(objectId, segment)}
          className="p-0.5 text-white/15 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
          title={`Délier « ${label} »`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 px-2 py-1 pl-9 bg-black/10 border-l-2 border-white/5 hover:bg-white/5 transition-colors group">
        <div className="w-3 border-b border-white/10 shrink-0 -ml-1" />

        {/* Color swatch */}
        <div
          className="w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
          style={{ backgroundColor: segment.fill }}
        />

        {/* Text preview */}
        <span className="text-[11px] text-white/40 truncate flex-1 font-mono">
          &quot;{preview}&quot;
        </span>

        {/* Font size */}
        <span className="text-[10px] text-white/25 tabular-nums shrink-0">
          {Math.round(segment.fontSize)}px
        </span>

        {/* Connect button — visible on hover when source is connected */}
        {isConnected && (
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className={`p-0.5 transition-colors shrink-0 ${
              pickerOpen ? 'text-indigo-400' : 'text-white/15 hover:text-indigo-400 opacity-0 group-hover:opacity-100'
            }`}
            title="Lier à un champ de données"
          >
            <Link2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Field picker dropdown */}
      {pickerOpen && (
        <div className="ml-9 mr-1 bg-[#111] border border-white/10 rounded-md shadow-xl overflow-hidden max-h-44 overflow-y-auto">
          {columns.length === 0 ? (
            <p className="text-[11px] text-white/30 px-3 py-2">Aucun champ disponible</p>
          ) : (
            columns.map((col) => {
              const Icon = col.fieldType === 'number' ? Hash : Type
              return (
                <button
                  key={col.key}
                  onClick={() => handleBind(col.key)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-indigo-500/10 transition-colors"
                >
                  <Icon className="w-3 h-3 text-white/25 shrink-0" />
                  <span className="text-xs text-white/70 truncate flex-1">{col.label}</span>
                  <span className="text-[10px] text-white/25 shrink-0 font-mono">{col.key}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
