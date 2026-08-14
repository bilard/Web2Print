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
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { BiBoard } from './BiBoard'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn } from '@/features/excel/types'
import { parseDashboard, type Dashboard, type TilePlacement } from '../types'

// ⚠ Une feuille SANS colonne n'est pas exploitable : le moteur se replie alors sur le
// catalogue master, et il n'y a pas de nom de feuille à mémoriser.
const col = (key: string): ExcelColumn => ({
  key, label: key, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160,
})

vi.mock('./DashboardGrid', () => ({ DashboardGrid: vi.fn(() => null) }))
vi.mock('./AddTileMenu', () => ({ AddTileMenu: vi.fn(() => null) }))
vi.mock('../store/dashboardsStore', () => ({ saveDashboard: vi.fn().mockResolvedValue(undefined) }))

const { DashboardGrid } = await import('./DashboardGrid')
const { AddTileMenu } = await import('./AddTileMenu')
const { saveDashboard } = await import('../store/dashboardsStore')
const gridCalls = () => vi.mocked(DashboardGrid).mock.calls

function makeDashboard(id: string, layout: TilePlacement[]): Dashboard {
  const tiles: Dashboard['tiles'] = [{
    id: 't1', kind: 'kpi', title: 'Total',
    query: { source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [] },
  }]
  return {
    id, name: id, accountId: 'acme', workspaceUid: 'u1',
    tiles, layout, filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
    // ⚠ La racine est le MIROIR de la première page : la fixture doit le respecter, sinon
    // elle testerait une forme que `parseDashboard` ne produit jamais.
    pages: [{ id: 'p1', name: id, tiles, layout }],
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

// ⚠⚠ Tâche 11 : le menu d'ajout est le SEUL chemin de création du module — sans lui, poser
// une tuile exigerait d'écrire dans Firestore à la main. Ces tests couvrent l'assemblage
// bout en bout (`AddTileMenu.onAdd` → `newTile`/`placeTile` → `addPlacement` → persistance)
// ET le cadenas d'édition, qui n'avait encore AUCUNE couverture.
describe('BiBoard — menu d’ajout de tuile', () => {
  beforeEach(() => {
    vi.mocked(AddTileMenu).mockClear()
    vi.mocked(saveDashboard).mockClear()
    useExcelStore.setState({ sheets: [], activeSheetIndex: 0 })
  })

  it('n’apparaît qu’EN ÉDITION et AVEC le droit d’écrire — jamais un seul des deux', () => {
    const dashboard = makeDashboard('d3', [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }])
    const { rerender } = render(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing={false} onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    expect(AddTileMenu).not.toHaveBeenCalled() // édition seule ne suffit pas sans le droit

    rerender(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit={false} onSelect={vi.fn()} />,
    )
    expect(AddTileMenu).not.toHaveBeenCalled() // le droit seul ne suffit pas hors édition

    rerender(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    expect(AddTileMenu).toHaveBeenCalled()
  })

  it('onAdd pose la tuile SOUS l’existante, la sauve, et la grille l’affiche immédiatement', () => {
    const dashboard = makeDashboard('d4', [{ tileId: 't1', x: 0, y: 0, w: 6, h: 4 }])
    render(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    const onAdd = vi.mocked(AddTileMenu).mock.calls.at(-1)![0].onAdd

    act(() => onAdd('bar', { id: 'count' }, 'taxo.1'))

    // Persisté : deux tuiles, et la nouvelle a bien une place (sinon `parseDashboard`
    // refuserait cette écriture à la relecture — la tuile orpheline recherchée en tâche 11).
    const saved = vi.mocked(saveDashboard).mock.calls.at(-1)![1]
    expect(saved.tiles).toHaveLength(2)
    const newTileId = saved.tiles.find((t) => t.id !== 't1')!.id
    expect(saved.layout.find((l) => l.tileId === newTileId)).toMatchObject({ y: 4 })

    // Affiché tout de suite : `draft.layout` (source de la grille) contient déjà le
    // placement, sans attendre l'écho asynchrone de Firestore via `current.layout`.
    expect(gridCalls().at(-1)![0].layout.find((l) => l.tileId === newTileId)).toBeTruthy()
  })

  // ⚠⚠ Le défaut : l'ajout se faisait en DEUX rendus (placement d'abord, tuile ensuite).
  // `react-grid-layout` élaguait le placement orphelin de son état interne, puis, l'écho
  // Firestore arrivé, repartait de son état élagué et reposait la tuile en 1×1 tout en bas —
  // et l'événement de mise en page émis dans la foulée armait le brouillon, si bien que le
  // premier glissement suivant persistait une mise en page dégénérée.
  //
  // Le test vérifie l'invariant sur TOUS les rendus, jamais sur le seul dernier : c'est un
  // rendu INTERMÉDIAIRE qui rompait le contrat.
  it('pose la tuile et son placement dans le MÊME rendu, écho de la base compris', () => {
    const dashboard = makeDashboard('d6', [{ tileId: 't1', x: 0, y: 0, w: 6, h: 4 }])
    const props = (current: Dashboard) => (
      <BiBoard current={current} items={[current]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />
    )
    const { rerender } = render(props(dashboard))
    const onAdd = vi.mocked(AddTileMenu).mock.calls.at(-1)![0].onAdd

    act(() => onAdd('bar', { id: 'count' }, 'taxo.1'))

    // L'écho Firestore : le document rapatrie enfin la tuile ET son placement.
    // ⚠ `parseDashboard` comme le ferait la lecture : c'est lui qui normalise les pages, et
    // l'écho doit donc être rejoué SOUS SA FORME NORMALISÉE, jamais telle qu'envoyée.
    const saved = parseDashboard(vi.mocked(saveDashboard).mock.calls.at(-1)![1])
    rerender(props(saved))

    for (const [gridProps] of gridCalls()) {
      const ids = new Set(gridProps.tiles.map((t) => t.id))
      expect(gridProps.layout.map((l) => l.tileId).filter((id) => !ids.has(id))).toEqual([])
      expect([...ids].filter((id) => !gridProps.layout.some((l) => l.tileId === id))).toEqual([])
    }

    const last = gridCalls().at(-1)![0]
    // L'écho ne duplique pas la tuile posée localement…
    expect(last.tiles).toHaveLength(2)
    // …et la taille de départ du type « barres » est intacte (jamais reposée en 1×1).
    const added = last.tiles.find((t) => t.id !== 't1')!
    expect(last.layout.find((l) => l.tileId === added.id)).toMatchObject({ w: 6, h: 6 })
  })

  // ⚠⚠ Sans cette mémoire, un tableau bâti sur un catalogue et rouvert avec la feuille d'un
  // concurrent active recalculait dessus, sous le même titre et avec les mêmes libellés.
  it('mémorise la feuille à la POSE DE LA PREMIÈRE TUILE, et n’y touche plus ensuite', () => {
    useExcelStore.setState({
      sheets: [{ name: 'Catalogue 2026', columns: [col('marque')], rows: [], taxonomy: [] }],
      activeSheetIndex: 0,
    })
    const dashboard = makeDashboard('d7', [{ tileId: 't1', x: 0, y: 0, w: 6, h: 4 }])
    const first = render(
      <BiBoard current={dashboard} items={[dashboard]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    act(() => vi.mocked(AddTileMenu).mock.calls.at(-1)![0].onAdd('kpi', { id: 'count' }))
    first.unmount() // sinon ce premier tableau, abonné à la feuille active, se rendrait encore
    expect(vi.mocked(saveDashboard).mock.calls.at(-1)![1].sourceSheetName).toBe('Catalogue 2026')

    // Feuille déjà mémorisée : elle FAIT FOI, une autre feuille active ne la réécrit pas —
    // sinon l'avertissement s'effacerait de lui-même au premier ajout de tuile.
    useExcelStore.setState({
      sheets: [{ name: 'Concurrent A', columns: [col('marque')], rows: [], taxonomy: [] }],
      activeSheetIndex: 0,
    })
    const built = { ...dashboard, sourceSheetName: 'Catalogue 2026' }
    render(
      <BiBoard current={built} items={[built]} uid="u1" width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    act(() => vi.mocked(AddTileMenu).mock.calls.at(-1)![0].onAdd('kpi', { id: 'count' }))
    expect(vi.mocked(saveDashboard).mock.calls.at(-1)![1].sourceSheetName).toBe('Catalogue 2026')
  })

  it('sans espace de travail (uid null), refuse et le dit — jamais un clic silencieux', () => {
    const dashboard = makeDashboard('d5', [])
    render(
      <BiBoard current={dashboard} items={[dashboard]} uid={null} width={1200}
        editing onToggleEdit={vi.fn()} canEdit onSelect={vi.fn()} />,
    )
    const onAdd = vi.mocked(AddTileMenu).mock.calls.at(-1)![0].onAdd

    act(() => onAdd('kpi', { id: 'count' }))
    expect(saveDashboard).not.toHaveBeenCalled()
  })
})
