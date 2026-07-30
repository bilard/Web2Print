import { Plus, Pencil, Trash2, Link } from 'lucide-react'
import { useCan } from '@/features/access/useAccess'
import { t } from '@/lib/i18n'

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
  const canEdit = useCan('taxonomies.edit')
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {canEdit && (
        <button
          onClick={onAddChild}
          className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
          aria-label={t('tx.addChild', { node: nodeLabel })}
        >
          <Plus className="w-3 h-3" />
        </button>
      )}
      {canEdit && (
        <button
          onClick={onRename}
          className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
          aria-label={`Renommer ${nodeLabel}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
      {isLeaf && (
        <button
          onClick={onLinkProjects}
          className="p-0.5 rounded text-white/30 hover:text-teal-400 hover:bg-teal-500/10 transition-colors"
          aria-label={t('tx.linkProjects', { node: nodeLabel })}
        >
          <Link className="w-3 h-3" />
        </button>
      )}
      {canEdit && (
        <button
          onClick={onDelete}
          className="p-0.5 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          aria-label={`Supprimer ${nodeLabel}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
