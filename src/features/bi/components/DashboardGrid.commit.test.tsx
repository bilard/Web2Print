// ⚠⚠ LE défaut qui a fait croire que « le placement n'est pas sauvegardé » :
// `react-grid-layout` appelle `onDragStop` AVANT `onLayoutChange`
// (ReactGridLayout.js, l. 198 puis 208). Branché sur `onDragStop`, le commit partait alors
// que la nouvelle mise en page n'était pas encore posée — le premier déplacement n'était
// jamais écrit, et chacun des suivants persistait celui d'AVANT.
//
// ⚠ La grille est MOQUÉE ici, à dessein : c'est l'ORDRE des rappels qu'on rejoue, et la vraie
// lib ne le laisse pas piloter. Le montage réel, lui, est couvert par `DashboardGrid.test`.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import type { Tile, TilePlacement } from '../types'

interface GridProps {
  children: ReactNode
  layout: { i: string; x: number; y: number; w: number; h: number }[]
  onLayoutChange?: (l: GridProps['layout']) => void
  onDragStart?: () => void
  onDragStop?: () => void
  onResizeStart?: () => void
}
let grid: GridProps | null = null
vi.mock('react-grid-layout', () => ({
  default: (props: GridProps) => { grid = props; return <div>{props.children}</div> },
}))
vi.mock('react-grid-layout/css/styles.css', () => ({}))
vi.mock('react-resizable/css/styles.css', () => ({}))

const { DashboardGrid } = await import('./DashboardGrid')

const tile: Tile = {
  id: 't1', kind: 'kpi', title: 'Total',
  query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
}
const layout: TilePlacement[] = [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }]
const MOVED = [{ i: 't1', x: 6, y: 4, w: 3, h: 2 }]

beforeEach(() => {
  grid = null
  useExcelStore.setState({ sheets: [], activeSheetIndex: 0 })
  usePimStore.setState({ products: [] })
})

const mount = (onDrag: () => void, onCommit: () => void) => render(
  <DashboardGrid
    tiles={[tile]} layout={layout} editing width={1200} globalFilters={[]}
    selectedTileId={null} crossFilter={null} onPick={() => {}} onDrill={() => {}} drills={{}}
    onSelectTile={vi.fn()} onRemoveTile={vi.fn()}
    onDrag={onDrag} onCommit={onCommit} onClearFilters={vi.fn()}
  />,
)

describe('quand la mise en page est ENREGISTRÉE', () => {
  it('après la nouvelle mise en page, jamais avant', () => {
    const calls: string[] = []
    mount(() => calls.push('drag'), () => calls.push('commit'))
    // La séquence EXACTE de la lib pour un déplacement.
    grid!.onDragStart?.()
    grid!.onDragStop?.()
    grid!.onLayoutChange?.(MOVED)
    expect(calls).toEqual(['drag', 'commit'])
  })

  it('après un redimensionnement aussi', () => {
    const calls: string[] = []
    mount(() => calls.push('drag'), () => calls.push('commit'))
    grid!.onResizeStart?.()
    grid!.onLayoutChange?.(MOVED)
    expect(calls).toEqual(['drag', 'commit'])
  })

  // ⚠⚠ `react-grid-layout` émet une mise en page au MONTAGE, après sa passe de correction
  // interne et sans le moindre geste : l'écrire réenregistrerait un tableau simplement OUVERT.
  it('jamais sur une mise en page que personne n’a bougée', () => {
    const calls: string[] = []
    mount(() => calls.push('drag'), () => calls.push('commit'))
    grid!.onLayoutChange?.(MOVED)
    expect(calls).toEqual(['drag'])
  })

  it('ni quand la grille redit exactement la mise en page en place', () => {
    const calls: string[] = []
    mount(() => calls.push('drag'), () => calls.push('commit'))
    grid!.onDragStart?.()
    grid!.onLayoutChange?.([{ i: 't1', x: 0, y: 0, w: 3, h: 2 }])
    expect(calls).toEqual([])
  })
})
