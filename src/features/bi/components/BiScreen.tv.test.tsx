// ⚠⚠ Ce que ce test protège : un écran mural qui se saborde à la première rotation.
//
// `BiBoard` est REMONTÉE à chaque changement de page (`key={id:pageId}`, imposé par
// `useLayoutDraft` qui ne resynchronise jamais). Un mode TV porté par `BiBoard` serait donc
// détruit par la rotation qu'il vient de déclencher : vingt secondes après l'entrée, la
// barre revient, les pages s'arrêtent, et la fenêtre reste en plein écran sans rien pour en
// sortir. L'état doit vivre AU-DESSUS du remontage — c'est tout l'objet de ce test, qu'un
// `renderHook` ne peut pas voir puisque le remontage n'y existe pas.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { BiScreen } from './BiScreen'
import type { Dashboard } from '../types'

const page = (id: string) => ({ id, name: id, tiles: [], layout: [] })
const board: Dashboard = {
  id: 'd1', name: 'Écarts', accountId: 'acme', workspaceUid: 'u1',
  tiles: [], layout: [], filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [page('p1'), page('p2'), page('p3')],
}

vi.mock('../hooks/useDashboards', () => ({ useDashboards: () => [board] }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'u1' }))
vi.mock('@/features/access/useAccess', () => ({ useCan: () => true }))
vi.mock('../templates/TemplateGallery', () => ({ TemplateGallery: () => null }))
vi.mock('../templates/TemplatesButton', () => ({ TemplatesButton: () => null }))
vi.mock('./BoardActionsMenu', () => ({ BoardActionsMenu: () => null }))
vi.mock('./NewDashboardButton', () => ({ NewDashboardButton: () => null }))
vi.mock('./BiBoard', () => ({ BiBoard: vi.fn(() => null) }))

const { BiBoard } = await import('./BiBoard')
const last = () => vi.mocked(BiBoard).mock.calls.at(-1)![0]

beforeEach(() => {
  vi.useFakeTimers()
  document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true, value: document.documentElement,
  })
  vi.mocked(BiBoard).mockClear()
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('mode TV au niveau de l’écran', () => {
  it('survit à la rotation qu’il déclenche', () => {
    render(<BiScreen />)
    const first = last().page.id
    act(() => { last().tv.enter() })
    expect(last().tv.on).toBe(true)

    // Une rotation complète : la page change, `BiBoard` est remontée…
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(last().page.id).not.toBe(first)
    // …et le mode TV, lui, tient bon.
    expect(last().tv.on).toBe(true)

    // La rotation continue, page après page, et revient à la première : un écran mural qui
    // s'arrête sur la dernière page reste figé pour la nuit.
    // ⚠ Un tic à la fois : entre deux battements, React doit avoir rendu la page courante,
    // sinon la minuterie repart de la page d'avant (en vrai, vingt secondes y suffisent).
    act(() => { vi.advanceTimersByTime(20_000) })
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(last().page.id).toBe(first)
    expect(last().tv.on).toBe(true)
  })
})
