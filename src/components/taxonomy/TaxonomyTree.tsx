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
import { buildTree, nodeMatchesSearch, nodeHasLinkedProjects } from '@/features/taxonomy/taxonomyUtils'
import { useTaxonomyProductCounts } from '@/features/taxonomy/useTaxonomyProductCounts'
import { TaxonomyNode } from './TaxonomyNode'
import type { Taxonomy, TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface TaxonomyTreeProps {
  taxonomy: Taxonomy
  onLinkProjects: (nodeId: string) => void
}

export function TaxonomyTree({ taxonomy, onLinkProjects }: TaxonomyTreeProps) {
  const { searchQuery, expandAll, showLinkedOnly } = useTaxonomyStore()
  const moveNode = useMoveNode()
  const initialized = useRef(false)
  const productCounts = useTaxonomyProductCounts(taxonomy)

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

  // En mode "Liés uniquement", développe automatiquement tous les ancêtres
  // qui contiennent un nœud lié pour révéler les feuilles d'un coup.
  useEffect(() => {
    if (!showLinkedOnly) return
    const fullTree = buildTree(taxonomy.nodes)
    const idsToExpand: string[] = []
    const walk = (nodes: TaxonomyNodeWithChildren[]) => {
      for (const n of nodes) {
        if (nodeHasLinkedProjects(n) && n.children.length > 0) {
          idsToExpand.push(n.id)
          walk(n.children)
        }
      }
    }
    walk(fullTree)
    if (idsToExpand.length > 0) expandAll(idsToExpand)
  }, [showLinkedOnly, taxonomy, expandAll])

  const tree = buildTree(taxonomy.nodes)

  // Filtrage search : ne garde que les branches qui contiennent un match
  let filteredTree = searchQuery
    ? tree.filter((n) => nodeMatchesSearch(n, searchQuery))
    : tree
  if (showLinkedOnly) {
    filteredTree = filteredTree.filter(nodeHasLinkedProjects)
  }

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
        showLinkedOnly={showLinkedOnly}
        productCounts={productCounts}
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
