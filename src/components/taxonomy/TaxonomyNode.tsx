import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useRenameNode, useDeleteNode, useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import { nodeHasLinkedProjects } from '@/features/taxonomy/taxonomyUtils'
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
  showLinkedOnly?: boolean
}

export function TaxonomyNode({ node, taxonomyId, onLinkProjects, searchQuery, showLinkedOnly = false }: TaxonomyNodeProps) {
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

  const hasLinkedProjects = node.linkedProjectIds.length > 0
  const hasLinkedDescendant = !hasLinkedProjects && nodeHasLinkedProjects(node)

  // Échelle monochrome indigo : hiérarchie par luminosité (clair → atténué)
  // pour une lecture harmonieuse niveau par niveau.
  const LEVEL_TEXT = [
    'text-white',            // 0 — titre, blanc pur
    'text-indigo-100',       // 1
    'text-indigo-200/90',    // 2
    'text-indigo-300/80',    // 3
    'text-indigo-300/65',    // 4
    'text-indigo-300/55',    // 5+
  ]
  const LEVEL_BULLET = [
    'bg-indigo-200',
    'bg-indigo-300',
    'bg-indigo-400/80',
    'bg-indigo-400/60',
    'bg-indigo-400/45',
    'bg-indigo-400/35',
  ]
  const LEVEL_FONT = [
    'text-[15px] font-bold',
    'text-[13px] font-semibold',
    'text-[12px] font-medium',
    'text-[12px] font-normal',
    'text-[11px] font-normal',
    'text-[11px] font-normal',
  ]
  const lvl = Math.min(node.level, LEVEL_TEXT.length - 1)

  const levelStyles = (() => {
    if (hasLinkedProjects) {
      // Nœud lié direct → teal franc, taille préservée selon le niveau
      return `${LEVEL_FONT[lvl]} text-teal-300`
    }
    if (hasLinkedDescendant) {
      // Ancêtre d'un nœud lié → teal atténué
      return `${LEVEL_FONT[lvl]} text-teal-400/70`
    }
    return `${LEVEL_FONT[lvl]} ${LEVEL_TEXT[lvl]}`
  })()
  const bulletColor = hasLinkedProjects
    ? 'bg-teal-300'
    : hasLinkedDescendant
      ? 'bg-teal-400/50'
      : LEVEL_BULLET[lvl]

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
    addNode.mutate({ taxonomyId, parentId: node.id, label: 'Nouveau nœud' })
    if (!isExpanded) toggleNode(node.id)
  }

  const handleDelete = () => {
    deleteNode.mutate({ taxonomyId, nodeId: node.id })
    setShowDeleteConfirm(false)
  }

  const visibleChildren = showLinkedOnly
    ? node.children.filter(nodeHasLinkedProjects)
    : node.children

  return (
    <div ref={setNodeRef} style={style} id={`taxonomy-node-${node.id}`}>
      <div
        className={`group flex items-center gap-1 px-2 py-[3px] rounded-md cursor-pointer select-none
          ${isHighlighted
            ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40'
            : hasLinkedProjects
              ? 'bg-teal-500/[0.07] hover:bg-teal-500/[0.12] ring-1 ring-teal-500/15'
              : 'hover:bg-white/[0.04]'}`}
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
            : <span className={`w-1.5 h-1.5 rounded-full block ${bulletColor}`} />}
        </button>
        {isEditing ? (
          <input ref={inputRef} value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRename} onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span className={`flex-1 truncate ${levelStyles}`}
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
      {!node.isLeaf && isExpanded && visibleChildren.length > 0 && (
        <div>
          {visibleChildren.map((child) => (
            <TaxonomyNode key={child.id} node={child} taxonomyId={taxonomyId}
              onLinkProjects={onLinkProjects} searchQuery={searchQuery} showLinkedOnly={showLinkedOnly}
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
