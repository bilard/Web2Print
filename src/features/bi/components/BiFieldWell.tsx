// Zone de dépôt d'un champ — Axe, Valeurs, Légende, Info-bulles, Filtres du visuel.
//
// ⚠⚠ Une zone qui ne peut pas prendre le champ survolé le DIT PENDANT le survol : bordure
// barrée, hachures, curseur, et la raison en toutes lettres. Un refus muet au relâchement se
// lit comme un geste raté — l'utilisateur recommence, et rien ne lui apprend pourquoi.
import { useDndContext, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTranslation } from '@/lib/i18n'
import { BiEyebrow } from './BiPanel'
import { BiWellChip } from './BiWellChip'
import { readDrag } from '../builder/dndPayload'
import { acceptField, type WellVerdict } from '../builder/wellRules'
import { wellChips, WELL_LABEL_KEY, type WellId } from '../builder/wells'
import type { DataSource } from '../registry/types'
import type { Tile } from '../types'

/** Hachures du refus. ⚠ Écrites en `rgba` plutôt qu'en classe Tailwind : un motif répété
 *  n'existe pas dans le jeu d'utilitaires, et le rouge tient dans les deux thèmes. */
const REFUSED_STRIPES = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(239,68,68,0.14) 0 6px, transparent 6px 12px)',
}

export function BiFieldWell({ well, slot = 'main', tile, source, canEdit, onApply }: {
  well: WellId
  /** Les filtres du visuel apparaissent dans DEUX volets : l'identifiant dnd-kit d'une zone
   *  doit rester unique, alors que le puits visé, lui, est le même. */
  slot?: string
  /** Tuile sélectionnée. `null` = rien à reconfigurer, la zone refuse et le dit. */
  tile: Tile | null
  source: DataSource
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  const { active } = useDndContext()
  const { isOver, setNodeRef } = useDroppable({
    id: `well:${well}:${slot}`, data: { kind: 'well', well },
  })

  const drag = readDrag(active?.data.current)
  // ⚠ Le verdict est recalculé à CHAQUE rendu du glissement, jamais mémorisé : le type du
  // visuel peut changer sous un clic de la galerie pendant qu'un champ est en l'air.
  const verdict: WellVerdict | null = !drag
    ? null
    : drag.kind === 'chip'
      ? (drag.well === well ? { ok: true } : { ok: false, reasonKey: 'bi.well.refuse.otherWell' })
      : acceptField(well, tile, drag.field, source)
  const refused = verdict !== null && !verdict.ok

  const chips = tile ? wellChips(well, tile, source) : []
  const ids = chips.map((c) => `chip:${well}:${slot}:${c.id}`)
  const label = t(WELL_LABEL_KEY[well])

  const border = refused
    ? 'border-red-500/60 cursor-no-drop'
    : verdict?.ok && isOver
      ? 'border-indigo-400/70 bg-indigo-500/10'
      : verdict?.ok
        ? 'border-indigo-400/30'
        : 'border-white/[0.14]'

  return (
    <div>
      <BiEyebrow>{label}</BiEyebrow>
      <div
        ref={setNodeRef} aria-label={label}
        style={refused && isOver ? REFUSED_STRIPES : undefined}
        className={`mt-1.5 min-h-[34px] rounded-lg border border-dashed bg-well p-1.5 flex flex-col gap-1 transition-colors ${border}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {chips.map((chip, i) => (
            <BiWellChip
              key={chip.id} dndId={ids[i]} chip={chip} well={well}
              tile={tile} canEdit={canEdit} onApply={onApply}
            />
          ))}
        </SortableContext>

        {chips.length === 0 && !refused && (
          <span className="px-1 py-0.5 text-[11px] text-white/25">{t('bi.well.drop')}</span>
        )}
      </div>

      {/* La RAISON, en clair, tant que le champ survole la zone qui le refuse. */}
      {refused && isOver && verdict && !verdict.ok && (
        <p className="mt-1 text-[10.5px] leading-snug text-red-300/90">{t(verdict.reasonKey)}</p>
      )}
    </div>
  )
}
