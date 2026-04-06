// src/components/taxonomy/TaxonomyTree.tsx
import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useMemo } from 'react'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useMoveNode } from '@/features/taxonomy/useTaxonomyMutations'
import { useProjects } from '@/features/projects/useProjects'
import { buildTree, nodeMatchesSearch } from '@/features/taxonomy/taxonomyUtils'
import { TaxonomyNode } from './TaxonomyNode'
import type { Taxonomy, TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface TaxonomyTreeProps {
  taxonomy: Taxonomy
  onLinkProjects: (nodeId: string) => void
}

export function TaxonomyTree({ taxonomy, onLinkProjects }: TaxonomyTreeProps) {
  const { searchQuery, expandAll } = useTaxonomyStore()
  const moveNode = useMoveNode()
  const { data: projects } = useProjects()
  const existingProjectIds = useMemo(
    () => new Set((projects ?? []).map((p) => p.id)),
    [projects]
  )
  const initialized = useRef(false)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over ? String(event.over.id) : null)
  }

  // Initialise l'état expand : niveau 0 toujours ouvert
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const level0Ids = Object.values(taxonomy.nodes)
      .filter((n) => n.level === 0)
      .map((n) => n.id)
    expandAll(level0Ids)
  }, [taxonomy.id, expandAll])

  const tree = buildTree(taxonomy.nodes)

  // Filtrage search : ne garde que les branches qui contiennent un match
  const filteredTree = searchQuery
    ? tree.filter((n) => nodeMatchesSearch(n, searchQuery))
    : tree

  // Tous les IDs sont enregistrés dans SortableContext pour couvrir les nœuds enfants
  const flatIds = Object.keys(taxonomy.nodes)

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    setOverId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const draggedId = String(active.id)
    const overId = String(over.id)
    const draggedNode = taxonomy.nodes[draggedId]
    const overNode = taxonomy.nodes[overId]
    if (!draggedNode || !overNode) return

    // Si même parent → réordonnement
    const newParentId = overNode.parentId
    const siblings = Object.values(taxonomy.nodes)
      .filter((n) => n.parentId === newParentId && n.id !== draggedId)
      .sort((a, b) => a.order - b.order)
    const overIndex = siblings.findIndex((n) => n.id === overId)
    const newOrder = overIndex === -1 ? siblings.length : overIndex

    moveNode.mutate({
      taxonomyId: taxonomy.id,
      nodeId: draggedId,
      newParentId,
      newOrder,
    })
  }

  const activeNodeLabel = activeId ? taxonomy.nodes[activeId]?.label : null

  function renderNodes(nodes: TaxonomyNodeWithChildren[]) {
    return nodes.map((node) => (
      <TaxonomyNode
        key={node.id}
        node={node}
        taxonomyId={taxonomy.id}
        onLinkProjects={onLinkProjects}
        searchQuery={searchQuery}
        dragOverId={overId}
        dragActiveId={activeId}
        existingProjectIds={existingProjectIds}
      />
    ))
  }

  if (Object.keys(taxonomy.nodes).length === 0) {
    return (
      <p className="text-[12px] text-white/30 px-4 py-3">
        Aucun nœud. Utilisez + pour en ajouter.
      </p>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
        <div className="py-1">{renderNodes(filteredTree)}</div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeNodeLabel ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e1e] border border-indigo-500/40 rounded-md shadow-xl">
            <span className="text-[12px] text-white/80">{activeNodeLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
