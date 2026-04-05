import { useState, useRef, useEffect } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Link,
  GripVertical,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useRenameNode, useDeleteNode, useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import type { TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface TaxonomyNodeProps {
  node: TaxonomyNodeWithChildren
  taxonomyId: string
  onLinkProjects: (nodeId: string) => void
  searchQuery: string
}

export function TaxonomyNode({
  node,
  taxonomyId,
  onLinkProjects,
  searchQuery,
}: TaxonomyNodeProps) {
  const { expandedNodeIds, highlightedNodeId, toggleNode } = useTaxonomyStore()
  const isExpanded = expandedNodeIds.has(node.id)
  const isHighlighted = highlightedNodeId === node.id
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(node.label)
  const [showActions, setShowActions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const renameNode = useRenameNode()
  const deleteNode = useDeleteNode()
  const addNode = useAddNode()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  const handleRename = () => {
    const trimmed = editLabel.trim()
    if (trimmed && trimmed !== node.label) {
      renameNode.mutate({ taxonomyId, nodeId: node.id, label: trimmed })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename()
    if (e.key === 'Escape') {
      setEditLabel(node.label)
      setIsEditing(false)
    }
  }

  const handleAddChild = () => {
    addNode.mutate({
      taxonomyId,
      parentId: node.id,
      label: 'Nouveau nœud',
    })
    if (!isExpanded) toggleNode(node.id)
  }

  // Mise en surbrillance de la query dans le label
  const highlightLabel = (label: string) => {
    if (!searchQuery) return <span>{label}</span>
    const idx = label.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx === -1) return <span>{label}</span>
    return (
      <span>
        {label.slice(0, idx)}
        <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
          {label.slice(idx, idx + searchQuery.length)}
        </mark>
        {label.slice(idx + searchQuery.length)}
      </span>
    )
  }

  return (
    <div ref={setNodeRef} style={style} id={`taxonomy-node-${node.id}`}>
      <div
        className={`group flex items-center gap-1 px-2 py-[3px] rounded-md cursor-pointer select-none
          ${isHighlighted ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40' : 'hover:bg-white/[0.04]'}
        `}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 flex-shrink-0"
          aria-label={`Déplacer ${node.label}`}
        >
          <GripVertical className="w-3 h-3" />
        </button>

        {/* Expand/collapse toggle */}
        <button
          onClick={() => !node.isLeaf && toggleNode(node.id)}
          className="flex-shrink-0 text-white/30 hover:text-white/60 w-4 h-4 flex items-center justify-center"
          aria-label={isExpanded ? `Réduire ${node.label}` : `Développer ${node.label}`}
        >
          {!node.isLeaf ? (
            isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-white/20 block" />
          )}
        </button>

        {/* Label */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span
            className="flex-1 text-[12px] text-white/70 truncate"
            onDoubleClick={() => { setIsEditing(true); setEditLabel(node.label) }}
          >
            {highlightLabel(node.label)}
          </span>
        )}

        {/* Linked projects badge */}
        {node.linkedProjectIds.length > 0 && (
          <span className="text-[10px] text-teal-400/70 bg-teal-500/10 px-1.5 rounded-full flex-shrink-0">
            {node.linkedProjectIds.length}
          </span>
        )}

        {/* Actions */}
        {(showActions || isEditing) && !isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={handleAddChild}
              className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label={`Ajouter un enfant à ${node.label}`}
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setIsEditing(true); setEditLabel(node.label) }}
              className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
              aria-label={`Renommer ${node.label}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
            {node.isLeaf && (
              <button
                onClick={() => onLinkProjects(node.id)}
                className="p-0.5 rounded text-white/30 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
                aria-label={`Lier des projets à ${node.label}`}
              >
                <Link className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => deleteNode.mutate({ taxonomyId, nodeId: node.id })}
              className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label={`Supprimer ${node.label}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {!node.isLeaf && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TaxonomyNode
              key={child.id}
              node={child}
              taxonomyId={taxonomyId}
              onLinkProjects={onLinkProjects}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}
