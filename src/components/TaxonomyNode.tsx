import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useRenameNode, useDeleteNode, useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import type { TaxonomyNodeWithChildren } from '@/features/taxonomy/types'
import { TaxonomyNodeActions } from './TaxonomyNodeActions'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

function highlightLabel(label: string, query: string) {
  if (!query) return <span>{label}</span>
  const idx = label.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{label}</span>
  return <span>{label.slice(0, idx)}<mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">{label.slice(idx, idx + query.length)}</mark>{label.slice(idx + query.length)}</span>
}

interface TaxonomyNodeProps {
  node: TaxonomyNodeWithChildren
  taxonomyId: string
  onLinkProjects: (nodeId: string) => void
  searchQuery: string
}

export function TaxonomyNode({ node, taxonomyId, onLinkProjects, searchQuery }: TaxonomyNodeProps) {
  const { expandedNodeIds, highlightedNodeId, toggleNode } = useTaxonomyStore()
  const isExpanded = expandedNodeIds.has(node.id)
  const isHighlighted = highlightedNodeId === node.id
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(node.label)
  const [showActions, setShowActions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const renameNode = useRenameNode()
  const deleteNode = useDeleteNode()
  const addNode = useAddNode()

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  useEffect(() => { if (isEditing) inputRef.current?.focus() }, [isEditing])

  useEffect(() => {
    if (!isEditing) setEditLabel(node.label)
  }, [node.label, isEditing])

  const handleRename = () => {
    const trimmed = editLabel.trim()
    if (trimmed && trimmed !== node.label) {
      renameNode.mutate({ taxonomyId, nodeId: node.id, label: trimmed })
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename()
    if (e.key === 'Escape') { setEditLabel(node.label); setIsEditing(false) }
  }

  const handleAddChild = () => {
    addNode.mutate({ taxonomyId, parentId: node.id, label: 'Nouveau nœud', nodeId: crypto.randomUUID() })
    if (!isExpanded) toggleNode(node.id)
  }

  const handleDelete = () => {
    deleteNode.mutate({ taxonomyId, nodeId: node.id })
    setShowDeleteConfirm(false)
  }

  return (
    <div ref={setNodeRef} style={style} id={`taxonomy-node-${node.id}`}>
      <div
        className={`group flex items-center gap-1 px-2 py-[3px] rounded-md cursor-pointer select-none
          ${isHighlighted ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40' : 'hover:bg-white/[0.04]'}`}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <button {...attributes} {...listeners}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 flex-shrink-0"
          aria-label={`Déplacer ${node.label}`}
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <button
          onClick={() => !node.isLeaf && toggleNode(node.id)}
          className="flex-shrink-0 text-white/30 hover:text-white/60 w-4 h-4 flex items-center justify-center"
          aria-label={isExpanded ? `Réduire ${node.label}` : `Développer ${node.label}`}
        >
          {!node.isLeaf
            ? (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)
            : <span className="w-1.5 h-1.5 rounded-full bg-white/20 block" />}
        </button>
        {isEditing ? (
          <input ref={inputRef} value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRename} onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span className="flex-1 text-[12px] text-white/70 truncate"
            onDoubleClick={() => { setIsEditing(true); setEditLabel(node.label) }}
          >
            {highlightLabel(node.label, searchQuery)}
          </span>
        )}
        {node.linkedProjectIds.length > 0 && (
          <span className="text-[10px] text-teal-400/70 bg-teal-500/10 px-1.5 rounded-full flex-shrink-0">
            {node.linkedProjectIds.length}
          </span>
        )}
        {showActions && !isEditing && (
          <TaxonomyNodeActions
            nodeLabel={node.label}
            isLeaf={node.isLeaf}
            onAddChild={handleAddChild}
            onRename={() => { setIsEditing(true); setEditLabel(node.label) }}
            onLinkProjects={() => onLinkProjects(node.id)}
            onDelete={() => setShowDeleteConfirm(true)}
          />
        )}
      </div>
      {!node.isLeaf && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TaxonomyNode key={child.id} node={child} taxonomyId={taxonomyId}
              onLinkProjects={onLinkProjects} searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce nœud ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera « {node.label} » et tous ses descendants. Elle est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
