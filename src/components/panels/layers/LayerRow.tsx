import { useState } from 'react'
import {
  GripVertical, ChevronRight, ChevronDown,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useLayers } from '@/features/editor/useLayers'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'
import { LayerSwatch } from './LayerSwatch'
import { LayerRowControls } from './LayerRowControls'
import { LayerNameInput } from './LayerNameInput'

interface Props {
  obj: CanvasObjectProps
  displayName: string
  isSelected: boolean
  segments: TextSegment[] | null
  expanded: boolean
  onToggleExpand: () => void
  depth?: number
  isDraggable?: boolean
}

export function LayerRow({
  obj, displayName, isSelected, segments, expanded, onToggleExpand,
  depth = 0, isDraggable = true,
}: Props) {
  const { selectLayer, renameLayer } = useLayers()
  const [isEditing, setIsEditing] = useState(false)
  const sortable = useSortable({ id: obj.id, disabled: !isDraggable || obj.locked })
  const isGroup = obj.type === 'group'
  const droppable = useDroppable({
    id: `drop-${obj.id}`,
    data: { groupId: obj.id },
    disabled: !isGroup,
  })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const hasMixedStyles = !isGroup && segments !== null && (segments.length > 1 || segments.some((s) => s.isPlaceholder))
  const isExpandable = isGroup || hasMixedStyles
  const paddingLeft = 8 + depth * 14

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } : {}

  const setCombinedRef = (el: HTMLElement | null) => {
    if (isDraggable) setNodeRef(el)
    if (isGroup) droppable.setNodeRef(el)
  }

  return (
    <div
      ref={setCombinedRef}
      style={{ ...style, paddingLeft, paddingRight: 8 }}
      onClick={() => selectLayer(obj.id)}
      className={`flex items-center gap-1.5 py-1.5 cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-indigo-500/20 border-l-2 border-indigo-500'
          : 'hover:bg-white/5 border-l-2 border-transparent'
      } ${obj.locked ? 'opacity-60' : ''} ${droppable.isOver ? 'ring-2 ring-indigo-500/60' : ''}`}
    >
      {isDraggable ? (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-0.5 text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-all shrink-0"
        >
          <GripVertical className="w-3 h-3" />
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      {isExpandable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          className="p-0.5 text-white/30 hover:text-white/70 transition-colors shrink-0"
          title={expanded ? 'Réduire' : 'Développer'}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <LayerSwatch obj={obj} />
      {isEditing ? (
        <LayerNameInput
          initial={obj.name}
          onCommit={(v) => { renameLayer(obj.id, v); setIsEditing(false) }}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <span
          onDoubleClick={(e) => { e.stopPropagation(); setIsEditing(true) }}
          className={`text-xs truncate flex-1 ${isGroup ? 'text-white/90 font-medium' : 'text-white/70'} ${
            !obj.name ? 'italic text-white/50' : ''
          }`}
        >
          {displayName}
        </span>
      )}

      {hasMixedStyles && (
        <span className="text-[9px] text-indigo-400/60 shrink-0 font-medium">Aa</span>
      )}

      <LayerRowControls obj={obj} isSelected={isSelected} />
    </div>
  )
}
