// Le CONTEXTE de glissement des trois volets : un champ saisi ici doit pouvoir atterrir
// dans une zone rendue par un AUTRE volet, donc un seul `DndContext` les enveloppe tous.
//
// ⚠ `activationConstraint: { distance: 5 }` : sans seuil, dnd-kit capte le `pointerdown` et
// le double-clic d'ajout rapide (geste 5) ne se déclencherait jamais.
//
// ⚠⚠ Le refus est décidé PENDANT le survol (`onDragOver`) et rendu par la zone elle-même.
// Le relâchement REJOUE le verdict plutôt que de faire confiance à l'état : entre les deux,
// la tuile sélectionnée peut avoir changé de type sous un raccourci clavier.
import { useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { Ban, GripVertical } from 'lucide-react'
import { readDrag, readDrop, type BuilderDrag } from '../builder/dndPayload'
import { acceptField } from '../builder/wellRules'
import { dropInWell, reorderWell } from '../builder/wellEdits'
import type { DataSource } from '../registry/types'
import type { Tile } from '../types'

export function BiBuilderDnd({ tile, source, onApply, children }: {
  /** Tuile SÉLECTIONNÉE, celle que le geste reconfigure. `null` = toutes les zones refusent. */
  tile: Tile | null
  source: DataSource
  onApply: (next: Tile) => void
  children: ReactNode
}) {
  const [drag, setDrag] = useState<BuilderDrag | null>(null)
  const [refused, setRefused] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const onDragStart = (e: DragStartEvent) => {
    setDrag(readDrag(e.active.data.current))
    setRefused(false)
  }

  const onDragOver = (e: DragOverEvent) => {
    const from = readDrag(e.active.data.current)
    const to = readDrop(e.over?.data.current)
    if (!from || !to) { setRefused(false); return }
    // Une puce déjà posée ne se réordonne QUE dans sa propre zone : la déplacer ailleurs
    // demanderait de la convertir (une dimension n'est pas une mesure), ce que le double-
    // clic et le glisser depuis le volet font déjà, plus lisiblement.
    setRefused(from.kind === 'chip'
      ? to.well !== from.well
      : !acceptField(to.well, tile, from.field, source).ok)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const from = readDrag(e.active.data.current)
    const to = readDrop(e.over?.data.current)
    setDrag(null)
    setRefused(false)
    if (!from || !to || !tile) return
    if (from.kind === 'field') {
      if (!acceptField(to.well, tile, from.field, source).ok) return
      onApply(dropInWell(tile, to.well, from.field, source))
      return
    }
    if (to.kind !== 'chip' || to.well !== from.well || to.index === from.index) return
    onApply(reorderWell(tile, from.well, from.index, to.index))
  }

  return (
    <DndContext
      sensors={sensors} collisionDetection={pointerWithin}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}
      onDragCancel={() => { setDrag(null); setRefused(false) }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {drag && (
          <div
            className={`flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11px] shadow-xl ${
              refused
                ? 'cursor-no-drop border-red-500/60 bg-red-500/15 text-red-200'
                : 'cursor-grabbing border-indigo-500/60 bg-indigo-500/20 text-white'
            }`}
          >
            {refused
              ? <Ban className="w-3 h-3 shrink-0" />
              : <GripVertical className="w-3 h-3 shrink-0 opacity-60" />}
            <span className="truncate max-w-[170px]">
              {drag.kind === 'field' ? drag.field.label : drag.label}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
