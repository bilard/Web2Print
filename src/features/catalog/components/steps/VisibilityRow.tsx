// Ligne de la liste « Éléments affichés » : poignée de glisser-déposer (ordre
// vertical dans la fiche) + case à cocher (visibilité) + NOM cliquable qui
// SÉLECTIONNE le bloc — même sélection que dans l'aperçu, ses réglages
// s'ouvrent dans « Bloc sélectionné ». La case et le nom sont deux cibles
// distinctes : cliquer le nom ne doit jamais masquer l'objet.
import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { CardObjectId } from '../../catalogTypes'
import { t } from '@/lib/i18n'

interface RowProps {
  /** Objet de fiche sélectionnable, ou null (élément de PAGE : filet du bandeau). */
  id: CardObjectId | null
  label: string
  checked: boolean
  onCheck: (v: boolean) => void
  selected?: boolean
  onSelect?: (id: CardObjectId) => void
  /** Branchement dnd-kit — absent pour une ligne non déplaçable. */
  drag?: {
    ref: Ref<HTMLDivElement>
    style: CSSProperties
    handle: HTMLAttributes<HTMLButtonElement>
  }
}

export function VisibilityRow({ id, label, checked, onCheck, selected, onSelect, drag }: RowProps) {
  return (
    <div ref={drag?.ref} style={drag?.style}
      className={`rounded-md ${selected ? 'bg-indigo-500/15 ring-1 ring-indigo-500/60' : ''}`}>
      <div className="flex items-center gap-1">
        {drag ? (
          <button type="button" {...drag.handle}
            title="Glisser pour changer la position du bloc dans la fiche"
            className="p-0.5 -ml-0.5 text-white/25 hover:text-white/70 cursor-grab active:cursor-grabbing touch-none">
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        {/* !== false côté appelant : les clés optionnelles (showBandRule) valent
            true sur les styles persistés anciens. */}
        <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)}
          title={`Afficher « ${label} »`} className="accent-indigo-600 cursor-pointer" />
        {id && onSelect ? (
          <button type="button" onClick={() => onSelect(id)} title={t('cat.vis.selectBlock')}
            className={`flex-1 text-left text-xs truncate py-0.5 ${selected ? 'text-white' : 'text-white/40 hover:text-white/80'}`}>
            {label}
          </button>
        ) : (
          <span className="flex-1 text-xs text-white/40 truncate py-0.5">{label}</span>
        )}
      </div>
    </div>
  )
}

/** Même ligne, branchée sur dnd-kit — À N'UTILISER QUE dans un `SortableContext`
 *  (useSortable hors contexte n'a pas de conteneur où s'enregistrer). */
export function SortableVisibilityRow({ id, ...rest }: RowProps & { id: CardObjectId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <VisibilityRow id={id} {...rest}
      drag={{
        ref: setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 },
        handle: { ...attributes, ...listeners },
      }} />
  )
}
