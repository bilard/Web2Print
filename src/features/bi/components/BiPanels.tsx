// Les deux volets de droite, sous UN SEUL contexte de glissement.
//
// ⚠⚠ Un champ saisi dans le volet « Champs » doit pouvoir atterrir dans une zone rendue par
// le volet « Visualisations » — puits ET filtres, désormais dans la même colonne : les deux
// vivent donc dans le même `DndContext`, monté ici. Deux contextes séparés rendraient le
// geste impossible entre volets, sans la moindre erreur — dnd-kit ne verrait aucune cible.
import { BiBuilderDnd } from './BiBuilderDnd'
import { BiVisualsPanel } from './BiVisualsPanel'
import { BiFieldsPanel } from './BiFieldsPanel'
import type { DataSource } from '../registry/types'
import type { FilterClause, Tile, TileKind } from '../types'

export function BiPanels({ tile, source, globalFilters, canEdit, onChangeKind, onApply }: {
  /** Tuile sélectionnée sur le canevas. `null` = les zones refusent, et le disent. */
  tile: Tile | null
  source: DataSource
  globalFilters: FilterClause[]
  canEdit: boolean
  onChangeKind: (kind: TileKind) => void
  onApply: (next: Tile) => void
}) {
  return (
    <BiBuilderDnd tile={tile} source={source} onApply={onApply}>
      <BiVisualsPanel
        tile={tile} source={source} globalFilters={globalFilters}
        onChangeKind={onChangeKind} onApply={onApply} canEdit={canEdit}
      />
      <BiFieldsPanel source={source} tile={tile} canEdit={canEdit} onApply={onApply} />
    </BiBuilderDnd>
  )
}
