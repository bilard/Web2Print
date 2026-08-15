// ⚠⚠ Ce que ces tests protègent : une suppression qui emporte plus que la tuile visée, ou
// qui laisse un trou dans la grille. Une page réécrite de travers ne se voit qu'à la
// relecture — c'est-à-dire une fois le contenu déjà perdu.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBoardActions } from './useBoardActions'
import type { Dashboard, Tile, TilePlacement } from '../types'

vi.mock('../store/dashboardsStore', () => ({ saveDashboard: vi.fn().mockResolvedValue(undefined) }))
const { saveDashboard } = await import('../store/dashboardsStore')
const written = () => vi.mocked(saveDashboard).mock.calls.at(-1)![1] as Dashboard

const tile = (id: string): Tile => ({
  id, kind: 'kpi', title: id,
  query: { source: 'watch.summary', measures: [{ id: 'count' }], dimensions: [], filters: [] },
})
const tiles = [tile('a'), tile('b'), tile('c')]
const layout: TilePlacement[] = [
  { tileId: 'a', x: 0, y: 0, w: 3, h: 3 },
  { tileId: 'b', x: 3, y: 0, w: 3, h: 3 },
  { tileId: 'c', x: 6, y: 0, w: 3, h: 3 },
]
const board: Dashboard = {
  id: 'd1', name: 'B', accountId: 'acme', workspaceUid: 'u1',
  tiles, layout, filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [{ id: 'p1', name: 'P', tiles, layout }],
}

const hook = () => renderHook(() => useBoardActions('u1', board, 'p1'))

beforeEach(() => { vi.mocked(saveDashboard).mockClear() })

describe('suppression d’une tuile', () => {
  it('retire la tuile ET son placement, sans toucher aux autres', () => {
    // Un placement orphelin ne se verrait pas tout de suite, mais réserverait un trou dans
    // la grille que plus rien ne remplirait.
    const { result } = hook()
    act(() => { result.current.removeTile('b', tiles, layout) })
    const page = written().pages![0]
    expect(page.tiles.map((x) => x.id)).toEqual(['a', 'c'])
    expect(page.layout.map((l) => l.tileId)).toEqual(['a', 'c'])
  })

  it('rend un geste qui REMET la tuile à sa place', () => {
    const { result } = hook()
    let undo: (() => void) | null = null
    act(() => { undo = result.current.removeTile('b', tiles, layout) })
    act(() => { undo!() })
    const page = written().pages![0]
    expect(page.tiles.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(page.layout.find((l) => l.tileId === 'b')).toEqual(layout[1])
  })

  it('n’écrit RIEN pour une tuile qui n’est pas là', () => {
    // Sans cette garde, un double-clic sur la corbeille réécrirait la page une seconde fois
    // — et le second appel rendrait un « annuler » qui ressusciterait la tuile déjà partie.
    const { result } = hook()
    let undo: (() => void) | null = null
    act(() => { undo = result.current.removeTile('zz', tiles, layout) })
    expect(undo).toBeNull()
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('supprime à partir des tuiles AFFICHÉES, pas de celles du document', () => {
    // ⚠ Entre le geste et l'écho Firestore, `current` retarde : supprimer depuis lui
    // ressusciterait la tuile qu'on vient d'ajouter.
    const shown = [...tiles, tile('d')]
    const shownLayout = [...layout, { tileId: 'd', x: 9, y: 0, w: 3, h: 3 }]
    const { result } = hook()
    act(() => { result.current.removeTile('a', shown, shownLayout) })
    expect(written().pages![0].tiles.map((x) => x.id)).toEqual(['b', 'c', 'd'])
  })
})
