// ⚠⚠ Un tableau de bord est une donnée de l'ESPACE DE TRAVAIL : une suppression accidentelle
// touche toute la société. Ce fichier tient les trois garde-fous — la confirmation NOMME le
// tableau, rien ne part avant elle, et un refus de la base se VOIT.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BoardActionsMenu } from './BoardActionsMenu'
import type { Dashboard } from '../types'

const deleteDashboard = vi.fn<(uid: string, id: string) => Promise<void>>()
const saveDashboard = vi.fn<(uid: string, d: unknown) => Promise<void>>()
const dashboardExists = vi.fn<(uid: string, id: string) => Promise<boolean>>()
const error = vi.fn()
const success = vi.fn()

vi.mock('../store/dashboardsStore', () => ({
  deleteDashboard: (uid: string, id: string) => deleteDashboard(uid, id),
  saveDashboard: (uid: string, d: unknown) => saveDashboard(uid, d),
  dashboardExists: (uid: string, id: string) => dashboardExists(uid, id),
}))
vi.mock('sonner', () => ({ toast: { error: (m: string) => error(m), success: (m: string) => success(m) } }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) => sel({ user: { uid: 'u1' } }),
}))
vi.mock('@/stores/access.store', () => ({
  useAccessStore: (sel: (s: { accountId: string }) => unknown) => sel({ accountId: 'acme' }),
}))

const BOARD: Dashboard = {
  id: 'd1', name: 'Ventes B2B', accountId: 'acme', workspaceUid: 'u1',
  tiles: [], layout: [], filters: [], version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [{ id: 'p1', name: 'Ventes B2B', tiles: [], layout: [] }],
}

const show = (over: { canEdit?: boolean; onDeleted?: () => void; onDuplicated?: (id: string) => void } = {}) =>
  render(
    <BoardActionsMenu
      board={BOARD} uid="u1" canEdit={over.canEdit ?? true}
      onDuplicated={over.onDuplicated ?? (() => {})} onDeleted={over.onDeleted ?? (() => {})}
      onOpenBoard={() => {}} onTv={() => {}}
    />,
  )

beforeEach(() => {
  deleteDashboard.mockReset().mockResolvedValue(undefined)
  saveDashboard.mockReset().mockResolvedValue(undefined)
  dashboardExists.mockReset().mockResolvedValue(false)
  error.mockReset()
  success.mockReset()
})

const openMenu = () => fireEvent.click(screen.getByLabelText(/Actions sur ce tableau/))

describe('BoardActionsMenu', () => {
  it('⚠ sans droit d’édition, le menu RESTE — mais sans aucun geste qui écrit', () => {
    // Projeter au mur ou repartir d'un modèle existant n'est pas modifier : masquer tout le
    // menu priverait un rôle consultation de gestes qui lui sont dus.
    show({ canEdit: false })
    openMenu()
    expect(screen.queryByText('Dupliquer')).toBeNull()
    expect(screen.queryByText('Supprimer')).toBeNull()
    expect(screen.getByText('Mode TV')).toBeTruthy()
  })

  it('⚠⚠ ne supprime RIEN au clic sur « Supprimer » : la confirmation d’abord', () => {
    show()
    openMenu()
    fireEvent.click(screen.getByText('Supprimer'))
    expect(deleteDashboard).not.toHaveBeenCalled()
  })

  it('⚠⚠ la confirmation NOMME le tableau — « Supprimer ? » ne dit pas ce qui part', () => {
    show()
    openMenu()
    fireEvent.click(screen.getByText('Supprimer'))
    expect(screen.getByText(/Ventes B2B/)).toBeTruthy()
  })

  it('confirmée, la suppression part et l’écran est prévenu', async () => {
    const onDeleted = vi.fn()
    show({ onDeleted })
    openMenu()
    fireEvent.click(screen.getByText('Supprimer'))
    // Le bouton rouge de la boîte : le second « Supprimer » du document.
    fireEvent.click(screen.getAllByText('Supprimer').at(-1)!)

    await waitFor(() => expect(deleteDashboard).toHaveBeenCalledWith('u1', 'd1'))
    await waitFor(() => expect(onDeleted).toHaveBeenCalled())
  })

  it('⚠⚠ un refus de la base se VOIT, et l’écran ne bascule PAS', async () => {
    deleteDashboard.mockRejectedValue(new Error('Missing or insufficient permissions'))
    const onDeleted = vi.fn()
    show({ onDeleted })
    openMenu()
    fireEvent.click(screen.getByText('Supprimer'))
    fireEvent.click(screen.getAllByText('Supprimer').at(-1)!)

    await waitFor(() => expect(error).toHaveBeenCalledWith('Missing or insufficient permissions'))
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('⚠ la duplication écrit sous un identifiant LIBRE, jamais sur un document vivant', async () => {
    // Le premier identifiant tiré est déjà pris (deux clics dans la même milliseconde) :
    // sans la vérification, `setDoc` écraserait la copie précédente.
    dashboardExists.mockResolvedValueOnce(true).mockResolvedValue(false)
    const onDuplicated = vi.fn()
    show({ onDuplicated })
    openMenu()
    fireEvent.click(screen.getByText('Dupliquer'))

    await waitFor(() => expect(saveDashboard).toHaveBeenCalled())
    const written = saveDashboard.mock.calls[0][1] as Dashboard
    expect(written.id).not.toBe('d1')
    expect(written.id).toMatch(/_1$/)
    expect(written.name).toBe('Ventes B2B (copie)')
    expect(onDuplicated).toHaveBeenCalledWith(written.id)
  })
})
