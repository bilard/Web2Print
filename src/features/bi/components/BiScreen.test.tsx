// ⚠⚠ Le raccourci « E » doit respecter `canEdit` À L'IDENTIQUE du bouton de `BiToolbar`
// (déjà cadenassé par `{canEdit && ...}`) : sans garde, un rôle consultation seule pouvait
// faire apparaître les poignées de déplacement et tenter des écritures vouées au refus
// Firestore — repéré en revue avant ce commit.
//
// `BiBoard` est mocké : ce fichier teste le raccourci clavier et la synchronisation avec les
// permissions, pas le rendu de la grille (couvert par `BiBoard.test.tsx`/`DashboardGrid.test.tsx`).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BiScreen } from './BiScreen'
import type { Dashboard } from '../types'

let canEdit = false
// ⚠ Mutable (et non un tableau fixe) : couvrir l'écran vide (aucun tableau de bord) exige
// de faire varier `items` d'un test à l'autre, sans quoi le bouton de création n'y serait
// jamais exercé.
let items: Dashboard[] = []

const ONE_DASHBOARD: Dashboard[] = [{
  id: 'd1', name: 'Ventes', accountId: 'acme', workspaceUid: 'u1',
  tiles: [], layout: [], filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [{ id: 'p1', name: 'Ventes', tiles: [], layout: [] }],
}]

// jsdom ne fournit pas `ResizeObserver` : `BiScreen` en a besoin pour mesurer la largeur de
// la grille (sans rapport avec ce qui est testé ici, mais nécessaire pour que le montage
// n'échoue pas).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.mock('../hooks/useDashboards', () => ({ useDashboards: (): Dashboard[] => items }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'u1' }))
vi.mock('@/features/access/useAccess', () => ({ useCan: () => canEdit }))
vi.mock('./BiBoard', () => ({ BiBoard: vi.fn(() => null) }))
vi.mock('./NewDashboardButton', () => ({ NewDashboardButton: vi.fn(() => <button>nouveau</button>) }))

const { BiBoard } = await import('./BiBoard')
const { NewDashboardButton } = await import('./NewDashboardButton')
const lastEditingProp = () => vi.mocked(BiBoard).mock.calls.at(-1)![0].editing

beforeEach(() => {
  canEdit = false
  items = ONE_DASHBOARD
  vi.mocked(BiBoard).mockClear()
  vi.mocked(NewDashboardButton).mockClear()
})

describe('BiScreen — raccourci « E » et permission', () => {
  it('reste inerte pour un rôle consultation seule (`canEdit` faux)', () => {
    render(<BiScreen />)
    expect(lastEditingProp()).toBe(false)

    fireEvent.keyDown(window, { key: 'e' })
    expect(lastEditingProp()).toBe(false) // pas de bascule : aucune poignée ne doit apparaître
  })

  it("bascule normalement une fois le droit d'édition acquis", () => {
    canEdit = true
    render(<BiScreen />)

    fireEvent.keyDown(window, { key: 'e' })
    expect(lastEditingProp()).toBe(true)

    fireEvent.keyDown(window, { key: 'E' })
    expect(lastEditingProp()).toBe(false)
  })

  it('un droit révoqué en cours de session referme le mode édition', () => {
    canEdit = true
    const { rerender } = render(<BiScreen />)
    fireEvent.keyDown(window, { key: 'e' })
    expect(lastEditingProp()).toBe(true)

    canEdit = false
    rerender(<BiScreen />)
    expect(lastEditingProp()).toBe(false)
  })
})

describe('BiScreen — bouton de création', () => {
  it('écran vide + droit d’édition : le message ET le bouton de création apparaissent', () => {
    items = []
    canEdit = true
    const { getByText } = render(<BiScreen />)

    getByText(/aucun tableau de bord/i)
    expect(NewDashboardButton).toHaveBeenCalled()
  })

  it('écran vide sans le droit d’édition : le message seul, jamais le bouton', () => {
    items = []
    canEdit = false
    const { getByText } = render(<BiScreen />)

    getByText(/aucun tableau de bord/i)
    expect(NewDashboardButton).not.toHaveBeenCalled()
  })

  it('des tableaux de bord existent, avec le droit d’édition : le bouton se branche dans l’en-tête de `BiBoard`', () => {
    canEdit = true
    render(<BiScreen />)

    expect(vi.mocked(BiBoard).mock.calls.at(-1)![0].headerAction).toBeTruthy()
  })

  it('des tableaux de bord existent, sans le droit d’édition : pas de bouton dans l’en-tête', () => {
    canEdit = false
    render(<BiScreen />)

    expect(vi.mocked(BiBoard).mock.calls.at(-1)![0].headerAction).toBeFalsy()
  })
})
