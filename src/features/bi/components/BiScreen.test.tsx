// ⚠⚠ Le raccourci « E » doit respecter `canEdit` À L'IDENTIQUE du bouton de `BiToolbar`
// (déjà cadenassé par `{canEdit && ...}`) : sans garde, un rôle consultation seule pouvait
// faire apparaître les poignées de déplacement et tenter des écritures vouées au refus
// Firestore — repéré en revue avant ce commit.
//
// `BiBoard` est mocké : ce fichier teste le raccourci clavier et la synchronisation avec les
// permissions, pas le rendu de la grille (couvert par `BiBoard.test.tsx`/`DashboardGrid.test.tsx`).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { act } from 'react'
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
vi.mock('../templates/TemplateGallery', () => ({ TemplateGallery: vi.fn(() => <div>modèles</div>) }))

const { BiBoard } = await import('./BiBoard')
const { TemplateGallery } = await import('../templates/TemplateGallery')
const { NewDashboardButton } = await import('./NewDashboardButton')
const lastEditingProp = () => vi.mocked(BiBoard).mock.calls.at(-1)![0].editing

beforeEach(() => {
  canEdit = false
  items = ONE_DASHBOARD
  vi.mocked(BiBoard).mockClear()
  vi.mocked(NewDashboardButton).mockClear()
  // ⚠ Sans ce nettoyage, `toHaveBeenCalled()` passerait grâce au test PRÉCÉDENT.
  vi.mocked(TemplateGallery).mockClear()
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
  // ⚠⚠ Vu chez l'utilisateur : six tableaux « Sans titre » vides, créés l'un après l'autre
  // sans comprendre quoi en faire. L'écran vide mène donc AUX MODÈLES d'abord ; la création
  // vierge reste offerte, en second, sous un trait.
  it('écran vide + droit d’édition : les MODÈLES d’abord, la création vierge ensuite', () => {
    items = []
    canEdit = true
    const { getByText } = render(<BiScreen />)

    getByText(/vierge/i)
    expect(TemplateGallery).toHaveBeenCalled()
    expect(NewDashboardButton).toHaveBeenCalled()
  })

  it('écran vide sans le droit d’édition : les modèles seuls, jamais la création vierge', () => {
    items = []
    canEdit = false
    render(<BiScreen />)

    expect(TemplateGallery).toHaveBeenCalled()
    expect(NewDashboardButton).not.toHaveBeenCalled()
  })

  it('des tableaux de bord existent, avec le droit d’édition : le bouton se branche dans l’en-tête de `BiBoard`', () => {
    canEdit = true
    render(<BiScreen />)

    render(<>{vi.mocked(BiBoard).mock.calls.at(-1)![0].headerAction}</>)
    expect(screen.getByText('nouveau')).toBeTruthy()
  })

  it('des tableaux de bord existent, sans le droit d’édition : aucune CRÉATION dans l’en-tête', () => {
    canEdit = false
    render(<BiScreen />)

    // ⚠ L'en-tête n'est pas vide pour autant : « Modèles » y reste, car il n'écrit rien de
    // lui-même (la galerie cadenasse la création carte par carte). Ce qui doit disparaître,
    // c'est la création VIERGE, qui écrit dès le clic.
    render(<>{vi.mocked(BiBoard).mock.calls.at(-1)![0].headerAction}</>)
    expect(screen.queryByText('nouveau')).toBeNull()
  })
})

// ⚠⚠ Le pont entre le clic sur « + » et l'affichage : `BiBoard` remonte la page neuve, et
// l'écran doit la MONTRER avant que la base ne la renvoie. Sans ce pont, le repli sur la
// première page reprend la main et le bouton se lit comme mort.
describe('BiScreen — page en attente', () => {
  beforeEach(() => {
    canEdit = true
    items = ONE_DASHBOARD
    vi.mocked(BiBoard).mockClear()
  })

  it('affiche la page neuve DANS LE MÊME rendu, avant l’écho de la base', () => {
    render(<BiScreen />)
    const before = vi.mocked(BiBoard).mock.calls.at(-1)![0]
    expect(before.pages).toHaveLength(1)

    const fresh = { id: 'p2', name: 'Page 2', tiles: [], layout: [] }
    act(() => before.onPageCreated(fresh))

    const after = vi.mocked(BiBoard).mock.calls.at(-1)![0]
    expect(after.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
    expect(after.page.id).toBe('p2') // …et c'est elle qu'on regarde
  })

  it('l’écho arrivé, la page en attente s’efface du composé — jamais en double', () => {
    render(<BiScreen />)
    const fresh = { id: 'p2', name: 'Page 2', tiles: [], layout: [] }
    act(() => vi.mocked(BiBoard).mock.calls.at(-1)![0].onPageCreated(fresh))

    // La base renvoie enfin le document, page neuve comprise.
    items = [{ ...ONE_DASHBOARD[0], pages: [...ONE_DASHBOARD[0].pages, fresh] }]
    render(<BiScreen />)

    const after = vi.mocked(BiBoard).mock.calls.at(-1)![0]
    expect(after.pages.map((p) => p.id)).toEqual(['p1', 'p2'])
  })
})
