// La puce d'un champ POSÉ : son nom, son agrégation (qui se change d'un clic), sa croix.
//
// ⚠⚠ Toutes les puces d'une zone tiennent sur UNE ligne, et les réglages passent par des
// menus flottants plutôt que par un sous-bloc déplié. Piège documenté dans ce dépôt : un
// sous-panneau imbriqué dans un élément triable donne un rect géant, `closestCenter` compare
// des centres incohérents et le glisser meurt SANS la moindre erreur console.
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { biLabel } from './biLabel'
import { BiChipOption, BiChipPopover } from './BiChipPopover'
import { BiFilterMenu } from './BiFilterMenu'
import { removeFromWell, setChipAggregation, updateFilter } from '../builder/wellEdits'
import type { WellChip, WellId } from '../builder/wells'
import type { FilterClause, Tile } from '../types'

export function BiWellChip({ dndId, chip, well, tile, canEdit, onApply }: {
  /** Identifiant dnd-kit, unique dans le contexte de glissement. */
  dndId: string
  chip: WellChip
  well: WellId
  tile: Tile | null
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  const label = biLabel(chip, t)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId, disabled: !canEdit,
    data: { kind: 'chip', well, index: chip.index, label },
  })

  const edit = (next: Tile | null) => { if (next) onApply(next) }
  const onFilter = (patch: Partial<FilterClause>) =>
    edit(tile ? updateFilter(tile, chip.index, patch) : null)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-md border px-1 py-1 text-[11px] ${
        isDragging
          ? 'border-indigo-500/40 bg-indigo-500/10 opacity-60'
          : 'border-white/[0.08] bg-white/[0.04]'
      }`}
    >
      <button
        {...attributes} {...listeners} type="button" disabled={!canEdit}
        title={t('bi.well.reorder')} aria-label={t('bi.well.reorder')}
        className="shrink-0 touch-none text-white/20 enabled:cursor-grab enabled:active:cursor-grabbing enabled:hover:text-white/50 disabled:opacity-40"
      >
        <GripVertical className="w-3 h-3" />
      </button>

      <span className="truncate flex-1 min-w-0 text-white/75" title={label}>{label}</span>

      {/* ⚠ Les agrégations offertes sont celles que le TYPE de la colonne autorise, jamais
          une liste figée : sommer du texte n'a pas de sens, et le moteur le refuserait. */}
      {chip.agg && chip.aggOptions.length > 0 && (
        <BiChipPopover
          label={t(`bi.agg.${chip.agg}` as TranslationKey)} title={t('bi.well.agg')}
          disabled={!canEdit || chip.aggOptions.length < 2}
        >
          {(close) => chip.aggOptions.map((a) => (
            <BiChipOption
              key={a} label={t(`bi.agg.${a}` as TranslationKey)} active={a === chip.agg}
              onPick={() => {
                edit(tile ? setChipAggregation(tile, well, chip.index, a) : null)
                close()
              }}
            />
          ))}
        </BiChipPopover>
      )}

      {chip.filter && (
        <BiFilterMenu filter={chip.filter} kind={chip.kind} disabled={!canEdit} onChange={onFilter} />
      )}

      {/* ⚠⚠ La croix est DÉSACTIVÉE sur la dernière mesure, motif affiché : le contrat exige
          au moins une mesure, et un document sans mesure serait refusé à l'enregistrement —
          le geste échouerait APRÈS coup, ce qui se lit comme une panne. */}
      <button
        type="button" disabled={!canEdit || !chip.removable}
        title={chip.removable ? t('bi.well.remove') : t('bi.well.lastMeasure')}
        aria-label={t('bi.well.remove')}
        onClick={() => edit(tile ? removeFromWell(tile, well, chip.index) : null)}
        className="shrink-0 rounded p-0.5 text-white/30 enabled:hover:text-red-300 enabled:hover:bg-red-500/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
