// ⚠⚠ Un tableau de bord vide qui ne passerait pas `parseDashboard` serait invisible dans la
// liste (`useDashboards` l'écarte en silence, cf. son commentaire) sans que rien ne le dise à
// l'écran. Le premier test ci-dessous rejoue donc la VRAIE validation, pas un mock qui la
// contournerait.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { NewDashboardButton } from './NewDashboardButton'
import { saveDashboard } from '../store/dashboardsStore'
import { parseDashboard, DASHBOARD_VERSION } from '../types'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'

vi.mock('../store/dashboardsStore', () => ({ saveDashboard: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => mockUid }))

let mockUid: string | null = 'u1'

beforeEach(() => {
  mockUid = 'u1'
  vi.mocked(saveDashboard).mockClear().mockResolvedValue(undefined)
  useAuthStore.setState({ user: { uid: 'user-1' } } as never)
  useAccessStore.setState({ accountId: 'acme' } as never)
})

describe('NewDashboardButton', () => {
  it('crée un tableau de bord VIDE mais VALIDE — passe la vraie parseDashboard', async () => {
    const onCreated = vi.fn()
    const { getByRole } = render(<NewDashboardButton onCreated={onCreated} />)

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1))
    const [uid, payload] = vi.mocked(saveDashboard).mock.calls[0]!
    expect(uid).toBe('u1')
    expect(() => parseDashboard(payload)).not.toThrow()
    expect(payload).toMatchObject({
      tiles: [], layout: [], filters: [], version: DASHBOARD_VERSION, accountId: 'acme',
    })
    expect(onCreated).toHaveBeenCalledWith(payload.id)
  })

  it("replie `accountId` sur 'default' quand aucune société n'est rattachée (`''`, pas `??`)", async () => {
    useAccessStore.setState({ accountId: '' } as never)
    const { getByRole } = render(<NewDashboardButton onCreated={vi.fn()} />)

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(saveDashboard).mock.calls[0]![1]
    expect(payload.accountId).toBe('default')
  })

  it("sans espace de travail (uid null), refuse et le dit — jamais un clic silencieux", async () => {
    mockUid = null
    const errorSpy = vi.spyOn(toast, 'error')
    const { getByRole } = render(<NewDashboardButton onCreated={vi.fn()} />)

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('un refus Firestore affiche le message et ne casse pas — `onCreated` non appelé', async () => {
    vi.mocked(saveDashboard).mockRejectedValueOnce(new Error('règle refusée'))
    const errorSpy = vi.spyOn(toast, 'error')
    const onCreated = vi.fn()
    const { getByRole } = render(<NewDashboardButton onCreated={onCreated} />)

    fireEvent.click(getByRole('button'))

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('règle refusée'))
    expect(onCreated).not.toHaveBeenCalled()
  })
})
