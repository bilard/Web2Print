// ⚠ `react-grid-layout` a une réécriture majeure (2.x, API `gridConfig`/`dragConfig`) sans
// rapport avec l'API classique (`cols`, `isDraggable`, `draggableHandle`…) attendue ici et
// couverte par `@types/react-grid-layout@1.3.x`. Le paquet est épinglé sur la lignée 1.5 —
// ce test monte le VRAI composant pour vérifier que le pin est le bon en exécution, pas
// seulement en typage.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardGrid } from './DashboardGrid'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import type { Tile, TilePlacement } from '../types'

const tile: Tile = {
  id: 't1', kind: 'kpi', title: 'Total',
  query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
}
const layout: TilePlacement[] = [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }]

beforeEach(() => {
  useExcelStore.setState({ sheets: [], activeSheetIndex: 0 })
  usePimStore.setState({ products: [] })
})

describe('DashboardGrid', () => {
  it('monte avec la grille classique (1.x) et rend la tuile dans son cadre', () => {
    // Aucune donnée chargée : la tuile rend son état `empty`, preuve que `TileFrame` et
    // `useTileData` sont bien câblés à travers `react-grid-layout`.
    render(
      <DashboardGrid
        tiles={[tile]} layout={layout} editing={false} width={1200} globalFilters={[]}
        selectedTileId={null} onSelectTile={vi.fn()}
        onDrag={vi.fn()} onCommit={vi.fn()} onClearFilters={vi.fn()}
      />,
    )
    expect(screen.getByText('Total')).toBeTruthy()
    // La cause remonte du hook : sans base ouverte, ce ne sont PAS les filtres qui vident la
    // tuile — et aucun bouton « retirer les filtres » n'est proposé, puisqu'il n'y en a pas.
    expect(screen.getByText(/module Données/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('ne déclenche pas onDrag au montage — sans geste, rien à mémoriser', () => {
    // ⚠ Si `react-grid-layout` appelait `onLayoutChange` après sa passe de correction
    // initiale, `draft.current` serait armé sans geste utilisateur et un `commit()` ultérieur
    // écrirait une mise en page que personne n'a bougée.
    const onDrag = vi.fn()
    render(
      <DashboardGrid
        tiles={[tile]} layout={layout} editing={false} width={1200} globalFilters={[]}
        selectedTileId={null} onSelectTile={vi.fn()}
        onDrag={onDrag} onCommit={vi.fn()} onClearFilters={vi.fn()}
      />,
    )
    expect(onDrag).not.toHaveBeenCalled()
  })

  it('en consultation, aucune poignée de déplacement — le curseur ne ment pas', () => {
    // ⚠ `isDraggable={editing}` bloque déjà le comportement ; sans ce test, l'affordance
    // visuelle (curseur « déplaçable ») pouvait rester affichée alors que le geste est
    // impossible.
    const { container, rerender } = render(
      <DashboardGrid
        tiles={[tile]} layout={layout} editing={false} width={1200} globalFilters={[]}
        selectedTileId={null} onSelectTile={vi.fn()}
        onDrag={vi.fn()} onCommit={vi.fn()} onClearFilters={vi.fn()}
      />,
    )
    expect(container.querySelector('.bi-tile-handle')).toBeNull()

    rerender(
      <DashboardGrid
        tiles={[tile]} layout={layout} editing width={1200} globalFilters={[]}
        selectedTileId={null} onSelectTile={vi.fn()}
        onDrag={vi.fn()} onCommit={vi.fn()} onClearFilters={vi.fn()}
      />,
    )
    expect(container.querySelector('.bi-tile-handle')).not.toBeNull()
  })
})
