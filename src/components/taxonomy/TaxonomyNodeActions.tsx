import { Plus, Pencil, Trash2, Link } from 'lucide-react'

interface TaxonomyNodeActionsProps {
  nodeLabel: string
  isLeaf: boolean
  onAddChild: () => void
  onRename: () => void
  onLinkProjects: () => void
  onDelete: () => void
}

export function TaxonomyNodeActions({
  nodeLabel,
  isLeaf,
  onAddChild,
  onRename,
  onLinkProjects,
  onDelete,
}: TaxonomyNodeActionsProps) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={onAddChild}
        className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
        aria-label={`Ajouter un enfant à ${nodeLabel}`}
      >
        <Plus className="w-3 h-3" />
      </button>
      <button
        onClick={onRename}
        className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
        aria-label={`Renommer ${nodeLabel}`}
      >
        <Pencil className="w-3 h-3" />
      </button>
      {isLeaf && (
        <button
          onClick={onLinkProjects}
          className="p-0.5 rounded text-white/30 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
          aria-label={`Lier des projets à ${nodeLabel}`}
        >
          <Link className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={onDelete}
        className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        aria-label={`Supprimer ${nodeLabel}`}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
