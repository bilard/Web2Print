// Quel VISUEL rend une tuile. Extrait de `DashboardGrid` pour être rendu à DEUX endroits :
// dans la grille, et dans la fenêtre d'agrandissement.
//
// ⚠ Un seul aiguillage : deux tables de correspondance donneraient une tuile agrandie qui
// n'est pas celle qu'on a cliquée — et personne ne s'en apercevrait avant de la lire.
import { KpiTile } from './tiles/KpiTile'
import { GaugeTile } from './tiles/GaugeTile'
import { FunnelTile } from './tiles/FunnelTile'
import { ScatterTile } from './tiles/ScatterTile'
import { Scatter3DTile } from './tiles/Scatter3DTile'
import { HeatmapTile } from './tiles/HeatmapTile'
import { ChartTile } from './tiles/ChartTile'
import { TableTile } from './tiles/TableTile'
import { PivotTile } from './tiles/PivotTile'
import type { AggregateResult } from '../engine/aggregate'
import type { Tile } from '../types'

export function TileVisual({ tile, result, accent, tooltipKeys, onPick, onDrill }: {
  tile: Tile
  result: AggregateResult
  accent: string
  /** Mesures d'info-bulle : calculées, mais écartées des séries par `ChartTile`. */
  tooltipKeys: ReadonlySet<string>
  onPick: (field: string, value: string | null) => void
  onDrill: (value: string | null) => void
}) {
  switch (tile.kind) {
    case 'kpi': return <KpiTile result={result} accent={accent} />
    case 'gauge': return <GaugeTile result={result} accent={accent} />
    case 'funnel': return <FunnelTile result={result} />
    case 'scatter': return <ScatterTile result={result} />
    case 'scatter3d': return <Scatter3DTile result={result} />
    case 'heatmap': return <HeatmapTile result={result} columnDim={tile.options?.pivotColumn} />
    case 'table': return <TableTile result={result} />
    case 'pivot':
      return <PivotTile result={result} columnDim={tile.options?.pivotColumn}
        showTotals={tile.options?.showTotals} />
    default:
      return <ChartTile result={result} kind={tile.kind} stacked={tile.options?.stacked}
        tooltipKeys={tooltipKeys} onPick={onPick} onDrill={onDrill} />
  }
}
