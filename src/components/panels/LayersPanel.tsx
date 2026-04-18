import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Eye, EyeOff, Trash2, GripVertical, Square, Circle, Type,
  Image as ImageIcon, Minus, ChevronRight, ChevronDown, Layers,
} from 'lucide-react'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore } from '@/stores/merge.store'
import { useLayers } from '@/features/editor/useLayers'
import { useTextSegments } from '@/features/editor/useTextSegments'
import { TextSegmentRow } from './TextSegmentRow'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'
import { useHighlight } from '@/features/help/hooks/useHighlight'
import { getDisplayName } from '@/features/editor/getDisplayName'

const typeIcons: Partial<Record<CanvasObjectProps['type'], React.ComponentType<{ className?: string }>>> = {
  rect: Square, ellipse: Circle, text: Type, image: ImageIcon,
  path: Square, line: Minus, group: Layers, polygon: Square, triangle: Square,
}

interface LayerItemProps {
  obj: CanvasObjectProps
  displayName: string
  isSelected: boolean
  segments: TextSegment[] | null
  expanded: boolean
  onToggleExpand: () => void
  depth?: number
  isDraggable?: boolean
}

function LayerItem({
  obj, displayName, isSelected, segments, expanded, onToggleExpand,
  depth = 0, isDraggable = true,
}: LayerItemProps) {
  const { selectLayer, deleteLayer, toggleVisibility } = useLayers()
  const sortable = useSortable({ id: obj.id, disabled: !isDraggable })
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable
  const Icon = typeIcons[obj.type] ?? Square
  const isGroup = obj.type === 'group'
  const hasMixedStyles = !isGroup && segments !== null && (segments.length > 1 || segments.some((s) => s.isPlaceholder))
  const isExpandable = isGroup || hasMixedStyles
  const paddingLeft = 8 + depth * 14

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } : {}

  return (
    <div
      ref={isDraggable ? setNodeRef : undefined}
      style={{ ...style, paddingLeft, paddingRight: 8 }}
      onClick={() => selectLayer(obj.id)}
      className={`flex items-center gap-1.5 py-1.5 cursor-pointer transition-colors group ${
        isSelected
          ? 'bg-indigo-500/20 border-l-2 border-indigo-500'
          : 'hover:bg-white/5 border-l-2 border-transparent'
      }`}
    >
      {/* Drag handle — seulement pour les objets top-level */}
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

      {/* Expand toggle */}
      {isExpandable ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleExpand() }}
          className="p-0.5 text-white/30 hover:text-white/70 transition-colors shrink-0"
          title={expanded ? 'Réduire' : 'Développer'}
        >
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />}
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <Icon className={`w-3.5 h-3.5 shrink-0 ${isGroup ? 'text-indigo-400/70' : 'text-white/40'}`} />
      <span className={`text-xs truncate flex-1 ${isGroup ? 'text-white/90 font-medium' : 'text-white/70'}`}>
        {displayName}
      </span>

      {/* Badge multi-styles */}
      {hasMixedStyles && (
        <span className="text-[9px] text-indigo-400/60 shrink-0 font-medium">Aa</span>
      )}

      {/* Visibility */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleVisibility(obj.id) }}
        className="p-0.5 text-white/20 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title={obj.visible ? 'Masquer' : 'Afficher'}
      >
        {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-white/20" />}
      </button>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id) }}
        className="p-0.5 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}

interface LayerTreeProps {
  objects: CanvasObjectProps[]
  selectedObjectId: string | null
  columns: { key: string; label: string }[]
  textSegments: Record<string, TextSegment[]>
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  depth?: number
  isDraggable?: boolean
}

function LayerTree({
  objects, selectedObjectId, columns, textSegments,
  expandedIds, onToggleExpand, depth = 0, isDraggable = true,
}: LayerTreeProps) {
  return (
    <>
      {objects.map((obj) => {
        const segments = textSegments[obj.id] ?? null
        const expanded = expandedIds.has(obj.id)
        const isGroup = obj.type === 'group'
        const displayName = getDisplayName(obj, columns)

        return (
          <div key={obj.id}>
            <LayerItem
              obj={obj}
              displayName={displayName}
              isSelected={obj.id === selectedObjectId}
              segments={segments}
              expanded={expanded}
              onToggleExpand={() => onToggleExpand(obj.id)}
              depth={depth}
              isDraggable={isDraggable}
            />

            {/* Enfants de groupe */}
            {isGroup && expanded && obj.children && obj.children.length > 0 && (
              <div className="border-l border-white/10 ml-5">
                <LayerTree
                  objects={[...obj.children].reverse()}
                  selectedObjectId={selectedObjectId}
                  columns={columns}
                  textSegments={textSegments}
                  expandedIds={expandedIds}
                  onToggleExpand={onToggleExpand}
                  depth={depth + 1}
                  isDraggable={false}
                />
              </div>
            )}

            {/* Segments de texte (styles mixtes) */}
            {!isGroup && expanded && segments && segments.map((seg, i) => (
              <TextSegmentRow key={i} segment={seg} index={i} objectId={obj.id} />
            ))}
          </div>
        )
      })}
    </>
  )
}

export function LayersPanel() {
  const { canvasObjects, selectedObjectId, setCanvasObjects } = useEditorStore()
  const columns = useMergeStore((s) => s.columns)
  const { reorderLayers } = useLayers()
  const textSegments = useTextSegments()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const layersHighlight = useHighlight<HTMLDivElement>('layers-panel')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const displayOrder = [...canvasObjects].reverse()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayOrder.findIndex((o) => o.id === active.id)
    const newIndex = displayOrder.findIndex((o) => o.id === over.id)
    const newDisplay = arrayMove(displayOrder, oldIndex, newIndex)
    setCanvasObjects([...newDisplay].reverse())
    reorderLayers(newDisplay.map((o) => o.id))
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (canvasObjects.length === 0) {
    return (
      <div
        ref={layersHighlight.ref}
        className={`p-4 flex flex-col items-center justify-center gap-2 text-white/20 py-12 ${layersHighlight.className}`}
      >
        <p className="text-sm">Aucun calque</p>
        <p className="text-xs text-center">Ajoutez des éléments depuis le panel Éléments</p>
      </div>
    )
  }

  return (
    <div ref={layersHighlight.ref} className={`flex flex-col ${layersHighlight.className}`}>
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 pt-3 pb-2">
        {canvasObjects.length} calque{canvasObjects.length > 1 ? 's' : ''}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={displayOrder.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          <LayerTree
            objects={displayOrder}
            selectedObjectId={selectedObjectId}
            columns={columns}
            textSegments={textSegments}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
          />
        </SortableContext>
      </DndContext>
    </div>
  )
}
