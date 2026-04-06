import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronRight, ChevronDown, GripVertical, Plus, Pencil, Link, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
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
  dragOverId?: string | null
  dragActiveId?: string | null
  existingProjectIds?: Set<string>
}

export function TaxonomyNode({ node, taxonomyId, onLinkProjects, searchQuery, dragOverId, dragActiveId, existingProjectIds }: TaxonomyNodeProps) {
  const linkedCount = existingProjectIds
    ? node.linkedProjectIds.filter((id) => existingProjectIds.has(id)).length
    : node.linkedProjectIds.length
  const { expandedNodeIds, highlightedNodeId, selectedNodeId, toggleNode, setSelectedNode } = useTaxonomyStore()
  const isExpanded = expandedNodeIds.has(node.id)
  const isHighlighted = highlightedNodeId === node.id
  const isSelected = selectedNodeId === node.id
  const isDropTarget = dragActiveId != null && dragOverId === node.id && dragActiveId !== node.id
  const [isEditing, setIsEditing] = useState(false)
  const [editLabel, setEditLabel] = useState(node.label)
  const [showActions, setShowActions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const renameNode = useRenameNode()
  const deleteNode = useDeleteNode()
  const addNode = useAddNode()

  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: node.id })

  // Style par niveau — dégradé bleu foncé → clair (contrasté)
  const levelStyles = [
    { border: 'border-blue-900/50', text: 'text-blue-400', dot: 'bg-blue-800', size: 'text-[15px] font-bold', py: 'py-1.5' },
    { border: 'border-blue-700/40', text: 'text-blue-300', dot: 'bg-blue-600/80', size: 'text-[13px] font-semibold', py: 'py-1' },
    { border: 'border-blue-500/35', text: 'text-blue-200', dot: 'bg-blue-400/70', size: 'text-[12px] font-medium', py: 'py-[3px]' },
    { border: 'border-sky-400/30', text: 'text-sky-200', dot: 'bg-sky-400/60', size: 'text-[11px] font-normal', py: 'py-[3px]' },
    { border: 'border-sky-300/25', text: 'text-sky-100', dot: 'bg-sky-300/50', size: 'text-[11px] font-normal', py: 'py-[2px]' },
  ]
  const lc = levelStyles[Math.min(node.level, levelStyles.length - 1)]

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  return (
    <div ref={setNodeRef} id={`taxonomy-node-${node.id}`}
      className={`relative ${isDragging ? 'opacity-10 pointer-events-none' : ''}`}
    >
      {/* Guides verticaux de hiérarchie */}
      {Array.from({ length: node.level }, (_, i) => {
        const guideColor = levelStyles[Math.min(i, levelStyles.length - 1)]
        return (
          <div key={i}
            className={`absolute top-0 bottom-0 w-px ${guideColor.border} border-l`}
            style={{ left: `${i * 16 + 14}px` }}
          />
        )
      })}
      {isDropTarget && (
        <div className="h-0.5 bg-teal-400 rounded-full mx-2 -mb-0.5 relative z-10 shadow-[0_0_6px_rgba(45,212,191,0.5)]" />
      )}
      <div
        className={`group flex items-center gap-1 px-2 ${lc.py} rounded-md cursor-pointer select-none transition-colors
          ${isSelected
            ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40'
            : isHighlighted
              ? 'bg-indigo-500/10'
              : 'hover:bg-white/[0.04]'
          }`}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        onClick={() => setSelectedNode(isSelected ? null : node.id)}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        onContextMenu={handleContextMenu}
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
            : <span className={`w-1.5 h-1.5 rounded-full ${lc.dot} block`} />}
        </button>
        {isEditing ? (
          <input ref={inputRef} value={editLabel} onChange={(e) => setEditLabel(e.target.value)}
            onBlur={handleRename} onKeyDown={handleKeyDown}
            className="flex-1 bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
          />
        ) : (
          <span className={`flex-1 ${lc.size} ${lc.text} truncate`}
            onDoubleClick={() => { setIsEditing(true); setEditLabel(node.label) }}
          >
            {highlightLabel(node.label, searchQuery)}
          </span>
        )}
        {linkedCount > 0 && (
          <span className="text-[10px] text-teal-400/70 bg-teal-500/10 px-1.5 rounded-full flex-shrink-0">
            {linkedCount}
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
              dragOverId={dragOverId} dragActiveId={dragActiveId}
              existingProjectIds={existingProjectIds}
            />
          ))}
        </div>
      )}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 w-44 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => { handleAddChild(); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter un enfant
            </button>
            <button
              onClick={() => { setIsEditing(true); setEditLabel(node.label); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Renommer
            </button>
            {node.isLeaf && (
              <button
                onClick={() => { onLinkProjects(node.id); setContextMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-teal-400/70 hover:bg-teal-500/10 transition-colors"
              >
                <Link className="w-3.5 h-3.5" />
                Lier des projets
              </button>
            )}
            <div className="h-px bg-white/[0.06] mx-2" />
            <button
              onClick={() => { setShowDeleteConfirm(true); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
          </div>
        </>
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
