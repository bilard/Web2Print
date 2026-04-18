import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { useEditorStore } from '@/stores/editor.store'
import { useMergeStore } from '@/stores/merge.store'
import { useLayers } from '@/features/editor/useLayers'
import { useTextSegments } from '@/features/editor/useTextSegments'
import { TextSegmentRow } from './TextSegmentRow'
import type { CanvasObjectProps } from '@/stores/editor.store'
import type { TextSegment } from '@/features/editor/useTextSegments'
import { useHighlight } from '@/features/help/hooks/useHighlight'
import { getDisplayName } from '@/features/editor/getDisplayName'
import { LayerRow } from './layers/LayerRow'

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
            <LayerRow
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
