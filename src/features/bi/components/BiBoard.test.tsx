// ⚠⚠ Ces deux tests couvrent les deux pièges signalés pour la tâche 10 :
// - `useLayoutDraft` ne resynchronise jamais son `initial` : `BiBoard` doit donc être
//   remontée (`key={current.id}`) par `BiScreen` pour qu'un changement de tableau de bord
//   se voie réellement.
// - `DashboardGrid` mémoïse ses tuiles sur la RÉFÉRENCE de `tiles`/`globalFilters`/
//   `onClearFilters` : ces props doivent rester stables d'un rendu à l'autre, y compris
//   pendant un geste (mise à jour de `draft.layout`).
//
// `DashboardGrid` est mocké : ce fichier teste l'ASSEMBLAGE (les props transmises), pas le
// rendu de la grille elle-même, déjà couvert par `DashboardGrid.test.tsx`.
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { BiBoard } from './BiBoard'
import type { Dashboard, TilePlacement } from '../types'

vi.mock('./DashboardGrid', () => ({ DashboardGrid: vi.fn(() => null) }))
vi.mock('../store/dashboardsStore', () => ({ saveDashboard: vi.fn().mockResolvedValue(undefined) }))

const { DashboardGrid } = await import('./DashboardGrid')
const gridCalls = () => vi.mocked(DashboardGrid).mock.calls

function makeDashboard(id: string, layout: TilePlacement[]): Dashboard {
  return {
    id, name: id, accountId: 'acme', workspaceUid: 'u1',
    tiles: [{
      id: 't1', kind: 'kpi', title: 'Total',
      query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
    }],
    layout, filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  }
}

describe('BiBoard', () => {
  it('conserve tiles/globalFilters/onClearFilters référentiellement stables pendant un geste', () => {
    const dashboard = makeDashboard('d1', [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }])
    render(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    const before = gridCalls().at(-1)![0]

    // Simule un glissement : `onDrag` (= `draft.setDraft`) met à jour l'état LOCAL du
    // hook, ce qui re-rend `BiBoard` — exactement le cas qui, sans mémoïsation correcte,
    // ferait fuiter une fonction fraîche vers `TileBody` à chaque frame.
    act(() => { before.onDrag([{ tileId: 't1', x: 1, y: 0, w: 3, h: 2 }]) })
    const after = gridCalls().at(-1)![0]

    expect(after.layout).not.toBe(before.layout) // la mise en page, elle, DOIT changer
    expect(after.tiles).toBe(before.tiles)
    expect(after.globalFilters).toBe(before.globalFilters)
    expect(after.onClearFilters).toBe(before.onClearFilters)
  })

  it('un changement non lié (bascule du mode édition) laisse aussi ces références intactes', () => {
    const dashboard = makeDashboard('d2', [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }])
    const { rerender } = render(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing={false} onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    const before = gridCalls().at(-1)![0]

    rerender(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    const after = gridCalls().at(-1)![0]

    expect(after.tiles).toBe(before.tiles)
    expect(after.globalFilters).toBe(before.globalFilters)
    expect(after.onClearFilters).toBe(before.onClearFilters)
  })

  it("remontée avec key={current.id} (le contrat imposé à BiScreen), la mise en page repart bien du NOUVEAU tableau de bord", () => {
    const a = makeDashboard('a', [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }])
    const b = makeDashboard('b', [{ tileId: 't1', x: 5, y: 1, w: 4, h: 3 }])

    function Wrapper({ current }: { current: Dashboard }) {
      return (
        <BiBoard key={current.id} current={current} items={[current]} uid="u1" width={1200}
          editing={false} onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />
      )
    }

    const { rerender } = render(<Wrapper current={a} />)
    expect(gridCalls().at(-1)![0].layout).toEqual(a.layout)

    rerender(<Wrapper current={b} />)
    expect(gridCalls().at(-1)![0].layout).toEqual(b.layout)
  })
})
