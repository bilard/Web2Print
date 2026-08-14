// SEUL point de contact avec `react-grid-layout` : la lib reste remplaçable.
//
// ⚠ En consultation, aucune poignée : `isDraggable`/`isResizable` sont faux. Un tableau
// consulté ne se déforme pas d'un clic malheureux.
//
// ⚠ Références stables : `layout`, `tiles` et `globalFilters` viennent tels quels du parent
// et sont transmis SANS reconstruction (pas de littéral ni de `.map()`/`.filter()` recréé à
// chaque rendu) jusqu'à `useTileData`, qui mémoïse sur l'égalité RÉFÉRENTIELLE de `query` et
// `globalFilters`. Seules `rgl`/`toPlacements`, qui ne nourrissent QUE `react-grid-layout`
// (jamais `useTileData`), sont recalculées à chaque rendu — sans conséquence.
import { memo } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { TileFrame } from './TileFrame'
import { KpiTile } from './tiles/KpiTile'
import { ChartTile } from './tiles/ChartTile'
import { TableTile } from './tiles/TableTile'
import { PivotTile } from './tiles/PivotTile'
import { useTileData } from '../hooks/useTileData'
import type { FilterClause, Tile, TilePlacement } from '../types'

const COLS = 12
const ROW_HEIGHT = 40

// `React.memo` : converti en rendus SAUTÉS les références stables que le parent doit fournir
// (`tile`, `globalFilters`, `onClearFilters`) — sans lui, chaque `onLayoutChange` pendant un
// geste re-rendrait les vingt tuiles (et leurs graphes chart.js) même quand aucune n'a bougé.
const TileBody = memo(function TileBody({ tile, editing, globalFilters, onClearFilters }: {
  tile: Tile; editing: boolean; globalFilters: FilterClause[]; onClearFilters: () => void
}) {
  const { result, state, error, updatedAt, live, retry } = useTileData(tile.query, globalFilters)
  const skeleton = tile.kind === 'kpi' ? 'kpi' : tile.kind === 'table' || tile.kind === 'pivot' ? 'table' : 'chart'
  return (
    <TileFrame
      title={tile.title} updatedAt={updatedAt} live={live} state={state} error={error} editing={editing}
      skeleton={skeleton} onRetry={retry} onClearFilters={onClearFilters}
    >
      {result && (
        tile.kind === 'kpi' ? <KpiTile result={result} />
          : tile.kind === 'table' ? <TableTile result={result} />
          : tile.kind === 'pivot' ? <PivotTile result={result} columnDim={tile.options?.pivotColumn} />
          : <ChartTile result={result} kind={tile.kind} stacked={tile.options?.stacked} />
      )}
    </TileFrame>
  )
})

/** Clé stable d'un item de mise en page, pour détecter un `onLayoutChange` sans changement. */
const layoutKey = (l: Layout) => `${l.i}:${l.x}:${l.y}:${l.w}:${l.h}`

/** Deux mises en page sont égales si chaque tuile occupe exactement la même case. */
function layoutsEqual(a: Layout[], b: Layout[]): boolean {
  if (a.length !== b.length) return false
  const keysA = new Set(a.map(layoutKey))
  return b.every((l) => keysA.has(layoutKey(l)))
}

export function DashboardGrid({ tiles, layout, editing, width, globalFilters, onDrag, onCommit, onClearFilters }: {
  tiles: Tile[]
  layout: TilePlacement[]
  editing: boolean
  width: number
  globalFilters: FilterClause[]
  onDrag: (l: TilePlacement[]) => void
  onCommit: () => void
  onClearFilters: () => void
}) {
  const rgl: Layout[] = layout.map((l) => ({ i: l.tileId, x: l.x, y: l.y, w: l.w, h: l.h }))
  const toPlacements = (l: Layout[]): TilePlacement[] =>
    l.map((x) => ({ tileId: x.i, x: x.x, y: x.y, w: x.w, h: x.h }))

  return (
    <GridLayout
      className="layout"
      layout={rgl}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={width}
      margin={[12, 12]}
      isDraggable={editing}
      isResizable={editing}
      draggableHandle=".bi-tile-handle"
      // ⚠ Pendant le geste, on ne fait que MÉMORISER : l'écriture se fait au relâchement.
      // ⚠⚠ `react-grid-layout` 1.x appelle `onLayoutChange` une première fois au MONTAGE,
      // après sa passe de correction interne, même sans le moindre geste — vérifié en test.
      // Sans garde, cet appel arme `draft.current` côté `useLayoutDraft` : un `commit()`
      // déclenché ensuite pour une tout autre raison écrirait une mise en page que personne
      // n'a bougée. On ne relaie l'appel que si la mise en page a RÉELLEMENT changé.
      onLayoutChange={(l) => { if (!layoutsEqual(rgl, l)) onDrag(toPlacements(l)) }}
      onDragStop={onCommit}
      onResizeStop={onCommit}
    >
      {tiles.map((t) => (
        <div key={t.id}>
          <TileBody tile={t} editing={editing} globalFilters={globalFilters} onClearFilters={onClearFilters} />
        </div>
      ))}
    </GridLayout>
  )
}
