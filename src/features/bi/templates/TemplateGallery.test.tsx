// L'accueil du module : ce qu'un clic écrit RÉELLEMENT, et ce qu'il refuse d'écrire.
//
// ⚠⚠ `saveDashboard` est mockée, mais la charge écrite repasse par la VRAIE `parseDashboard` :
// un document invalide serait écarté à la lecture (`useDashboards`) sans un mot à l'écran.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { TemplateGallery } from './TemplateGallery'
import { templateDocId } from './index'
import { dashboardExists, saveDashboard } from '../store/dashboardsStore'
import { parseDashboard, type Dashboard } from '../types'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'

vi.mock('../store/dashboardsStore', () => ({
  saveDashboard: vi.fn().mockResolvedValue(undefined),
  dashboardExists: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => mockUid }))
vi.mock('../hooks/useDashboards', () => ({
  useDashboards: () => ({ items: mockDashboards, broken: [] }),
}))
vi.mock('@/features/priceWatch/useCatalogReport', () => ({ useWatchList: () => mockWatches }))

let mockUid: string | null = 'u1'
let mockDashboards: Dashboard[] = []
let mockWatches: { watchId: string }[] = []

beforeEach(() => {
  mockUid = 'u1'
  mockDashboards = []
  mockWatches = [{ watchId: 'w1' }]
  vi.mocked(saveDashboard).mockClear().mockResolvedValue(undefined)
  vi.mocked(dashboardExists).mockClear().mockResolvedValue(false)
  useAuthStore.setState({ user: { uid: 'user-1' } } as never)
  useAccessStore.setState({ accountId: 'acme' } as never)
  useExcelStore.setState({ sheets: [], activeSheetIndex: 0 } as never)
  usePimStore.setState({ products: [] } as never)
})

const cardButton = (el: HTMLElement, index: number) =>
  el.querySelectorAll('section > div > div > button')[index] as HTMLElement

describe('TemplateGallery', () => {
  it('crée un tableau de bord VALIDE et l’ouvre', async () => {
    const onOpen = vi.fn()
    const { container } = render(<TemplateGallery onOpen={onOpen} />)

    fireEvent.click(cardButton(container, 0))

    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1))
    const [uid, payload] = vi.mocked(saveDashboard).mock.calls[0]!
    expect(uid).toBe('u1')
    expect(() => parseDashboard(payload)).not.toThrow()
    // ⚠ Identifiant DÉTERMINISTE : c'est lui qui rend la création idempotente.
    expect(payload.id).toBe(templateDocId('watchGaps'))
    expect(payload.tiles.every((t) => t.title.trim() !== '')).toBe(true)
    expect(onOpen).toHaveBeenCalledWith(payload.id)
  })

  it('n’écrit PAS un second exemplaire : le modèle déjà créé s’ouvre', async () => {
    mockDashboards = [{ id: templateDocId('watchGaps') } as Dashboard]
    const onOpen = vi.fn()
    const { container } = render(<TemplateGallery onOpen={onOpen} />)

    fireEvent.click(cardButton(container, 0))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(templateDocId('watchGaps')))
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('n’écrase PAS un tableau existant que la liste n’a pas encore reçu', async () => {
    // ⚠⚠ Le cas RÉEL : `useDashboards` part de `[]` et se remplit au premier instantané.
    // Sans le contrôle sur la base, `setDoc` remplacerait le tableau déjà bâti sur ce modèle.
    vi.mocked(dashboardExists).mockResolvedValue(true)
    const onOpen = vi.fn()
    const { container } = render(<TemplateGallery onOpen={onOpen} />)

    fireEvent.click(cardButton(container, 0))

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(templateDocId('watchGaps')))
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('stampille la feuille active sur le modèle PIM, jamais sur un modèle de veille', async () => {
    useExcelStore.setState({
      sheets: [{
        name: 'Catalogue F1', columns: [{ key: 'a' }], rows: [], taxonomy: [],
        taxonomyLevels: { a: 1 },
      }],
      activeSheetIndex: 0,
    } as never)
    const { container } = render(<TemplateGallery onOpen={vi.fn()} />)

    fireEvent.click(cardButton(container, 2))
    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(1))
    // ⚠ Un modèle arrive avec ses tuiles DÉJÀ POSÉES : personne d'autre ne stampillera ce
    // champ, et sans lui l'écran n'avertirait jamais qu'on lit une AUTRE feuille.
    expect(vi.mocked(saveDashboard).mock.calls[0]![1].sourceSheetName).toBe('Catalogue F1')

    fireEvent.click(cardButton(container, 0))
    await waitFor(() => expect(saveDashboard).toHaveBeenCalledTimes(2))
    expect(vi.mocked(saveDashboard).mock.calls[1]![1].sourceSheetName).toBeUndefined()
  })

  it('sans droit d’édition, la création est fermée AVANT le clic', () => {
    const { container } = render(<TemplateGallery onOpen={vi.fn()} canEdit={false} />)

    expect((cardButton(container, 0) as HTMLButtonElement).disabled).toBe(true)
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('source absente : la carte le DIT et refuse le clic, plutôt qu’un tableau vide', () => {
    mockWatches = []
    const { container, getAllByText } = render(<TemplateGallery onOpen={vi.fn()} />)

    // Aucun suivi de veille : les DEUX modèles de veille annoncent le geste à faire.
    expect(getAllByText(/Comparer catalogue/)).toHaveLength(2)
    expect((cardButton(container, 0) as HTMLButtonElement).disabled).toBe(true)
    expect(saveDashboard).not.toHaveBeenCalled()
  })

  it('feuille ouverte SANS niveaux de taxonomie : le modèle PIM se refuse et le dit', () => {
    useExcelStore.setState({
      sheets: [{ name: 'F', columns: [{ key: 'a' }], rows: [], taxonomy: [] }], activeSheetIndex: 0,
    } as never)
    const { container, getByText } = render(<TemplateGallery onOpen={vi.fn()} />)

    // ⚠⚠ Sans niveaux désignés, `taxo.1`…`taxo.4` sont TOUS nuls : chaque tuile n'afficherait
    // qu'un groupe « valeur absente » — le tableau vide que ce garde-fou existe pour éviter.
    expect(getByText(/taxonomie/)).toBeTruthy()
    expect((cardButton(container, 2) as HTMLButtonElement).disabled).toBe(true)
  })

  it('un refus d’écriture est VISIBLE, jamais silencieux', async () => {
    vi.mocked(saveDashboard).mockRejectedValueOnce(new Error('règle refusée'))
    const errorSpy = vi.spyOn(toast, 'error')
    const onOpen = vi.fn()
    const { container } = render(<TemplateGallery onOpen={onOpen} />)

    fireEvent.click(cardButton(container, 0))

    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('règle refusée'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('sans espace de travail (uid null), refuse et le dit', async () => {
    mockUid = null
    const errorSpy = vi.spyOn(toast, 'error')
    const { container } = render(<TemplateGallery onOpen={vi.fn()} />)

    fireEvent.click(cardButton(container, 0))

    await waitFor(() => expect(errorSpy).toHaveBeenCalled())
    expect(saveDashboard).not.toHaveBeenCalled()
  })
})
