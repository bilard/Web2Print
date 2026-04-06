// src/components/taxonomy/TaxonomyTree.tsx
import { useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useMoveNode } from '@/features/taxonomy/useTaxonomyMutations'
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
  const initialized = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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

  function renderNodes(nodes: TaxonomyNodeWithChildren[]) {
    return nodes.map((node) => (
      <TaxonomyNode
        key={node.id}
        node={node}
        taxonomyId={taxonomy.id}
        onLinkProjects={onLinkProjects}
        searchQuery={searchQuery}
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
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
        <div className="py-1">{renderNodes(filteredTree)}</div>
      </SortableContext>
    </DndContext>
  )
}
