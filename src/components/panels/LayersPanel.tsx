import { useState } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, DragOverlay,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { useShallow } from 'zustand/react/shallow'
import { useEditorStore, type CanvasObjectProps } from '@/stores/editor.store'
import { useMergeStore } from '@/stores/merge.store'
import { useLayers } from '@/features/editor/useLayers'
import { useTextSegments } from '@/features/editor/useTextSegments'
import { useHighlight } from '@/features/help/hooks/useHighlight'
import { LayerTree } from './layers/LayerTree'
import { LayerSearchBar } from './layers/LayerSearchBar'
import { LayerDragPreview } from './layers/LayerDragPreview'
import { useLayerFilter } from '@/features/editor/useLayerFilter'

function collectAllIds(objects: CanvasObjectProps[]): string[] {
  const ids: string[] = []
  for (const o of objects) {
    ids.push(o.id)
    if (o.children) ids.push(...collectAllIds(o.children))
  }
  return ids
}

function findObjById(objects: CanvasObjectProps[], id: string): CanvasObjectProps | null {
  for (const o of objects) {
    if (o.id === id) return o
    if (o.children) {
      const found = findObjById(o.children, id)
      if (found) return found
    }
  }
  return null
}

export function LayersPanel() {
  // useShallow : re-render uniquement si ces 3 slices changent (pas sur saveStatus,
  // projectTitle, canUndo… qui changent aussi mais ne concernent pas les calques).
  const { canvasObjects, selectedObjectId, setCanvasObjects } = useEditorStore(
    useShallow((s) => ({
      canvasObjects: s.canvasObjects,
      selectedObjectId: s.selectedObjectId,
      setCanvasObjects: s.setCanvasObjects,
    })),
  )
  const columns = useMergeStore((s) => s.columns)
  const { reorderLayers, moveLayerToGroup } = useLayers()
  const textSegments = useTextSegments()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const layersHighlight = useHighlight<HTMLDivElement>('layers-panel')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const { filtered, forceExpandedIds } = useLayerFilter(canvasObjects, searchQuery, columns)
  const displayOrder = [...filtered].reverse()
  const effectiveExpandedIds = new Set([...expandedIds, ...forceExpandedIds])
  const rootDroppable = useDroppable({ id: 'drop-root' })

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const overId = String(over.id)
    const activeId = String(active.id)

    // Drop sur la racine (fond du panneau) → sortir du groupe
    if (overId === 'drop-root') {
      moveLayerToGroup(activeId, null)
      return
    }

    // Drop sur un header de groupe
    if (overId.startsWith('drop-')) {
      const groupId = overId.slice(5)
      if (groupId !== activeId) moveLayerToGroup(activeId, groupId)
      return
    }

    // Réordonnancement top-level (si les deux sont top-level)
    const oldIndex = displayOrder.findIndex((o) => o.id === activeId)
    const newIndex = displayOrder.findIndex((o) => o.id === overId)
    if (oldIndex < 0 || newIndex < 0) return  // enfant de groupe ou cible invalide
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
      <LayerSearchBar value={searchQuery} onChange={setSearchQuery} />
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 pt-3 pb-2">
        {canvasObjects.length} calque{canvasObjects.length > 1 ? 's' : ''}
      </p>
      {searchQuery ? (
        <LayerTree
          objects={displayOrder}
          selectedObjectId={selectedObjectId}
          columns={columns}
          textSegments={textSegments}
          expandedIds={effectiveExpandedIds}
          onToggleExpand={toggleExpand}
          isDraggable={false}
          searchQuery={searchQuery}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragCancel={() => setActiveDragId(null)} onDragEnd={handleDragEnd}>
          <div ref={rootDroppable.setNodeRef} className={`pb-12 ${rootDroppable.isOver ? 'bg-white/5' : ''}`}>
            <SortableContext items={collectAllIds(displayOrder)} strategy={verticalListSortingStrategy}>
              <LayerTree
                objects={displayOrder}
                selectedObjectId={selectedObjectId}
                columns={columns}
                textSegments={textSegments}
                expandedIds={effectiveExpandedIds}
                onToggleExpand={toggleExpand}
                searchQuery={searchQuery}
              />
            </SortableContext>
          </div>
          <DragOverlay>
            {activeDragId ? (() => {
              const obj = findObjById(canvasObjects, activeDragId)
              return obj ? <LayerDragPreview obj={obj} columns={columns} /> : null
            })() : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
