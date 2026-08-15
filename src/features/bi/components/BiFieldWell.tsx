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
import { useSourceRows } from '../hooks/useSourceRows'
import { readDrag } from '../builder/dndPayload'
import { acceptField, type WellVerdict } from '../builder/wellRules'
import { wellChips, WELL_LABEL_KEY, type WellId } from '../builder/wells'
import { WELL_COLOR, tinted } from './fieldColors'
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
  // Les lignes de la source alimentent les valeurs proposées par un filtre.
  const rows = useSourceRows(source.id)
  const { active, over } = useDndContext()
  const { isOver, setNodeRef } = useDroppable({
    id: `well:${well}:${slot}`, data: { kind: 'well', well },
  })
  // ⚠⚠ Survoler une puce, c'est survoler SA ZONE. Vu à l'écran : au-dessus d'une zone déjà
  // pleine, le pointeur tombe sur la puce — une cible dnd-kit à part entière — et `isOver`
  // restait faux : la zone se bordait de rouge SANS dire pourquoi, ce qui est précisément le
  // refus muet qu'on veut éviter.
  const chipPrefix = `chip:${well}:${slot}:`
  const hovering = isOver
    || (typeof over?.id === 'string' && over.id.startsWith(chipPrefix))

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
  const ids = chips.map((c) => `${chipPrefix}${c.id}`)
  const label = t(WELL_LABEL_KEY[well])

  const border = refused
    ? 'border-red-500/60 cursor-no-drop'
    : verdict?.ok && hovering
      ? 'border-indigo-400/70 bg-indigo-500/10'
      : verdict?.ok
        ? 'border-indigo-400/30'
        : 'border-white/[0.14]'

  const tint = WELL_COLOR[well]

  return (
    <div>
      <BiEyebrow>
        {/* ⚠ La teinte relie la ZONE à la puce qu'elle porte : sur cinq zones identiques,
            elle dit d'un coup d'œil où un champ a atterri. */}
        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
          style={{ background: tint }} />
        {label}
      </BiEyebrow>
      <div
        /* ⚠ `data-bi-well` : le repli du relâchement (cf. `BiBuilderDnd`) retrouve la zone
           SOUS LE POINTEUR quand dnd-kit n'a pas eu le temps de désigner une cible. */
        ref={setNodeRef} aria-label={label} data-bi-well={well}
        style={refused && hovering
          ? REFUSED_STRIPES
          // Fond très dilué : la zone se distingue sans que ses puces perdent en lisibilité.
          : (chips.length > 0 ? { background: tinted(tint, '0d') } : undefined)}
        className={`mt-1.5 min-h-[34px] rounded-lg border border-dashed bg-well p-1.5 flex flex-col gap-1 transition-colors ${border}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {chips.map((chip, i) => (
            <BiWellChip
              key={chip.id} dndId={ids[i]} chip={chip} well={well}
              tile={tile} source={source} rows={rows} canEdit={canEdit} onApply={onApply}
            />
          ))}
        </SortableContext>

        {chips.length === 0 && !refused && (
          <span className="px-1 py-0.5 text-[11px] text-white/25">{t('bi.well.drop')}</span>
        )}
      </div>

      {/* La RAISON, en clair, tant que le champ survole la zone qui le refuse. */}
      {refused && hovering && verdict && !verdict.ok && (
        <p className="mt-1 text-[10.5px] leading-snug text-red-300/90">{t(verdict.reasonKey)}</p>
      )}
    </div>
  )
}
