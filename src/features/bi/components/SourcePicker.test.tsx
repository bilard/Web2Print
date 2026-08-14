import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { SourcePicker } from './SourcePicker'
import { resetWatchDataForTest, useWatchSelection, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'uid-1' }))

const context = (over: Partial<WatchContext> = {}): WatchContext => ({
  watches: [{ watchId: 'f1', label: 'F1 Veille', updatedAt: 1 }],
  sites: [{ siteId: 'a', domain: 'a.fr' }, { siteId: 'b', domain: 'b.fr' }],
  watchId: 'f1', siteId: null, ...over,
})

/** Le suivi actif vit dans le store de module : le poser passe par le geste public. */
function selectWatch(id: string | null) {
  const { result } = renderHook(() => useWatchSelection())
  act(() => result.current.setWatchId(id))
}

beforeEach(() => resetWatchDataForTest())

const show = (sourceId: SourceId, demanded: SourceId[] = [], ctx = context()) =>
  render(<SourcePicker context={ctx} demanded={demanded} sourceId={sourceId} onSourceChange={() => {}} />)

describe('SourcePicker', () => {
  it('⚠⚠ n’utilise AUCUN menu natif (spec lot 2, D5)', () => {
    const { container } = show('watch.summary')
    expect(container.querySelector('select')).toBeNull()
  })

  it('ne montre ni suivi ni concurrent quand rien ne touche à la veille', () => {
    show('pim.products')
    expect(screen.queryByText('Suivi')).toBeNull()
    expect(screen.queryByText('Concurrent')).toBeNull()
  })

  it('⚠⚠ parle de ce qui ALIMENTE les tuiles, pas de ce que la liste affiche', () => {
    // Le cas réel : un tableau de veille rouvert. La liste repart sur « Produits (PIM) »
    // pendant que les tuiles lisent le catalogue source — sans ce test, le bandeau se
    // taisait et l'écran restait sur des squelettes sans un mot.
    selectWatch('f1')
    show('pim.products', ['watch.catalog'])
    expect(screen.getByText('Suivi')).toBeTruthy()
    expect(screen.getByText(/Rien n’est chargé/)).toBeTruthy()
  })

  it('nomme le suivi actif dès qu’une source de veille est choisie', () => {
    selectWatch('f1')
    show('watch.summary')
    expect(screen.getByText('F1 Veille')).toBeTruthy()
  })

  it('n’offre le choix d’un concurrent que pour les fiches d’un concurrent', () => {
    selectWatch('f1')
    show('watch.catalog')
    expect(screen.queryByText('Concurrent')).toBeNull()
  })

  it('⚠ offre le concurrent dès qu’une TUILE en réclame un, pas seulement à la sélection', () => {
    // Sinon le message de la tuile (« désignez-en un dans le sélecteur de source ») pointerait
    // vers un contrôle absent de l'écran.
    selectWatch('f1')
    show('pim.products', ['watch.site'])
    expect(screen.getByText('Concurrent')).toBeTruthy()
  })

  it('propose les concurrents du rapport, et n’en retient qu’un', () => {
    selectWatch('f1')
    show('watch.site')
    fireEvent.click(screen.getByText('Concurrent').parentElement!.querySelector('button')!)
    expect(screen.getByText('a.fr')).toBeTruthy()
    fireEvent.click(screen.getByText('b.fr'))
    const { result } = renderHook(() => useWatchSelection())
    expect(result.current.siteId).toBe('b')
  })

  it('dit qu’aucun suivi n’existe plutôt que d’afficher un sélecteur vide', () => {
    show('watch.summary', [], context({ watches: [], sites: [], watchId: null }))
    expect(screen.getByText(/Aucun suivi de veille/)).toBeTruthy()
  })

  it('annonce que rien ne se charge tant qu’aucune tuile ne réclame la source', () => {
    selectWatch('f1')
    show('watch.catalog')
    expect(screen.getByText(/Rien n’est chargé/)).toBeTruthy()
  })
})
