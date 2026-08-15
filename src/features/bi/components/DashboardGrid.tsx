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
import { memo, useMemo } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { TileFrame } from './TileFrame'
import { KpiTile } from './tiles/KpiTile'
import { GaugeTile } from './tiles/GaugeTile'
import { FunnelTile } from './tiles/FunnelTile'
import { ScatterTile } from './tiles/ScatterTile'
import { HeatmapTile } from './tiles/HeatmapTile'
import { ChartTile } from './tiles/ChartTile'
import { TableTile } from './tiles/TableTile'
import { PivotTile } from './tiles/PivotTile'
import { useTileData } from '../hooks/useTileData'
import { useTileDetail } from '../hooks/useTileDetail'
import { DetailDrawer } from './DetailDrawer'
import { applyDrill, type DrillStep } from '../filters/drill'
import { measureKey, type FilterClause, type Tile, type TilePlacement } from '../types'

const COLS = 12
const ROW_HEIGHT = 40

/** Référence stable : un tableau frais casserait la mémoïsation des tuiles non forées. */
const NO_STEPS: readonly DrillStep[] = []

// `React.memo` : converti en rendus SAUTÉS les références stables que le parent doit fournir
// (`tile`, `globalFilters`, `onClearFilters`) — sans lui, chaque `onLayoutChange` pendant un
// geste re-rendrait les vingt tuiles (et leurs graphes chart.js) même quand aucune n'a bougé.
const TileBody = memo(function TileBody({ tile, editing, selected, globalFilters, onClearFilters, onSelect, onPick, onDrill, drillSteps, dimmed }: {
  tile: Tile; editing: boolean; selected: boolean
  globalFilters: FilterClause[]; onClearFilters: () => void
  /** ⚠ Reçoit l'IDENTIFIANT plutôt qu'une fermeture par tuile : le parent transmet UNE
   *  fonction stable, et la mémoïsation de `React.memo` tient pendant un geste. */
  onSelect: (tileId: string) => void
  /** Clic sur un élément du visuel : filtre la PAGE sur la valeur cliquée. */
  onPick: (field: string, value: string | null) => void
  /** Double-clic : descendre d'un niveau dans la hiérarchie de l'axe de CETTE tuile. */
  onDrill: (value: string | null) => void
  /** Pas de forage déjà franchis par cette tuile : sa requête est rejouée en conséquence. */
  drillSteps: readonly DrillStep[]
  /** La tuile est estompée parce qu'une AUTRE porte le filtre croisé actif. On estompe au
   *  lieu de masquer : le contexte de ce qu'on écarte reste visible. */
  dimmed: boolean
}) {
  // ⚠⚠ Les mesures d'INFO-BULLE rejoignent `measures` pour être CALCULÉES — le moteur ne
  // connaît pas `query.tooltips` — puis `ChartTile` les écarte des séries. Mémoïsé, et rendu
  // PAR IDENTITÉ quand la tuile n'en porte pas : `useTileData` mémoïse sur la référence de
  // `query`, et un littéral frais à chaque rendu referait l'agrégation à chaque frame.
  const query = useMemo(() => {
    // ⚠ Le forage se REJOUE ici, il n'est jamais écrit dans la tuile : rouvrir le tableau
    // doit ramener chaque tuile au niveau que l'utilisateur a configuré.
    const base = drillSteps.length ? applyDrill(tile.query, drillSteps) : tile.query
    const tips = base.tooltips
    return tips?.length ? { ...base, measures: [...base.measures, ...tips] } : base
  }, [tile.query, drillSteps])
  const tooltipKeys = useMemo(
    () => new Set((tile.query.tooltips ?? []).map((m) => measureKey(m))), [tile.query])

  const { result, state, message, updatedAt, live, retry } = useTileData(query, globalFilters)
  // ⚠ Le détail lit la requête EFFECTIVE (forage compris) : le tiroir doit montrer les
  // lignes du niveau où l'on se trouve, pas celles du niveau d'origine.
  const inspect = useTileDetail(tile.title, query, globalFilters)
  const skeleton = tile.kind === 'kpi' || tile.kind === 'gauge'
    ? 'kpi'
    : tile.kind === 'table' || tile.kind === 'pivot' || tile.kind === 'heatmap' ? 'table' : 'chart'
  return (
    <div className={`h-full transition-opacity duration-200 ${dimmed ? 'opacity-40' : ''}`}>
    <TileFrame
      title={tile.title} updatedAt={updatedAt} live={live} state={state} message={message} editing={editing}
      skeleton={skeleton} hasFilters={globalFilters.length > 0} selected={selected}
      onSelect={() => onSelect(tile.id)} onInspect={() => inspect.toggle(true)}
      onRetry={retry} onClearFilters={onClearFilters}
    >
      {result && (
        tile.kind === 'kpi' ? <KpiTile result={result} />
          : tile.kind === 'gauge' ? <GaugeTile result={result} />
          : tile.kind === 'funnel' ? <FunnelTile result={result} />
          : tile.kind === 'scatter' ? <ScatterTile result={result} />
          : tile.kind === 'heatmap'
            ? <HeatmapTile result={result} columnDim={tile.options?.pivotColumn} />
          : tile.kind === 'table' ? <TableTile result={result} />
          : tile.kind === 'pivot'
            ? <PivotTile result={result} columnDim={tile.options?.pivotColumn}
                showTotals={tile.options?.showTotals} />
          : <ChartTile result={result} kind={tile.kind} stacked={tile.options?.stacked}
              tooltipKeys={tooltipKeys} onPick={onPick} onDrill={onDrill} />
      )}
    </TileFrame>
    {inspect.open && inspect.detail && (
      <DetailDrawer title={tile.title} detail={inspect.detail} filters={inspect.filterLabels}
        onClose={() => inspect.toggle(false)} onExport={inspect.exportRows} />
    )}
    </div>
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

export function DashboardGrid({
  tiles, layout, editing, width, globalFilters, selectedTileId, crossFilter, drills,
  onDrag, onCommit, onClearFilters, onSelectTile, onPick, onDrill,
}: {
  tiles: Tile[]
  layout: TilePlacement[]
  editing: boolean
  width: number
  globalFilters: FilterClause[]
  /** Tuile décrite par les volets de droite. `null` = aucune. */
  selectedTileId: string | null
  /** Filtre croisé actif, posé par un clic dans une tuile. `null` = aucun. */
  crossFilter: { tileId: string; field: string; value: string | null } | null
  /** Un clic dans une tuile : le tableau de bord décide ce qu'il en fait. */
  onPick: (tileId: string, field: string, value: string | null) => void
  /** Double-clic : descendre d'un niveau dans la hiérarchie de l'axe de la tuile visée. */
  onDrill: (tileId: string, value: string | null) => void
  /** Pas de forage PAR TUILE — non persistés : le forage est une exploration, pas une
   *  configuration. Rouvrir le tableau ramène chaque tuile à son niveau enregistré. */
  drills: Record<string, DrillStep[]>
  onDrag: (l: TilePlacement[]) => void
  onCommit: () => void
  onClearFilters: () => void
  /** ⚠ Doit être RÉFÉRENTIELLEMENT STABLE : `TileBody` est mémoïsé, et une fonction fraîche
   *  à chaque rendu annulerait la mémoïsation que ce fichier existe pour préserver. */
  onSelectTile: (tileId: string) => void
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
          <TileBody
            /* ⚠ La sélection ne se VOIT qu'en édition : en consultation elle ne commande
               plus rien (ni volets, ni poignées), et un liseré qui ne mène nulle part
               laisserait croire à une tuile mise en avant pour une raison. */
            tile={t} editing={editing} selected={editing && t.id === selectedTileId}
            globalFilters={globalFilters} onClearFilters={onClearFilters} onSelect={onSelectTile}
            /* ⚠ La tuile d'où part le filtre reste PLEINE : c'est elle qu'on regarde. Les
               autres s'estompent pour dire « je montre moins », sans se dérober. */
            dimmed={!!crossFilter && crossFilter.tileId !== t.id}
            onPick={(field, value) => onPick(t.id, field, value)}
            onDrill={(value) => onDrill(t.id, value)}
            drillSteps={drills[t.id] ?? NO_STEPS}
          />
        </div>
      ))}
    </GridLayout>
  )
}
