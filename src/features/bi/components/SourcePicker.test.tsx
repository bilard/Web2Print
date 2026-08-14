import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { SourcePicker } from './SourcePicker'
import { resetWatchDataForTest, useWatchSelection, type WatchContext } from '../hooks/useWatchData'
import type { SourceId } from '../types'

vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'uid-1' }))
// ⚠ Sans ce doublon, le sélecteur de base interrogerait Firestore depuis jsdom.
vi.mock('@/features/excel/useExcelFirebase', () => ({
  useExcelFirebase: () => ({
    listSavedFiles: () => Promise.resolve([
      { fileName: 'Catalogue_GSB_2026', docId: 'db1', totalRows: 43210, updatedAt: null, path: [] },
      { fileName: 'Makita', docId: 'db2', totalRows: 812, updatedAt: null, path: [] },
    ]),
    loadFromFirebase: () => Promise.resolve(null),
  }),
}))

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

// ⚠⚠ Vu chez l'utilisateur : dix bases dans le module Données, et une seule entrée
// « Produits (PIM) » qui désignait implicitement la feuille ouverte AILLEURS.
describe('SourcePicker — choix de la base du PIM', () => {
  const showDb = (sourceId: SourceId, demanded: SourceId[] = [], onDbChange = () => {}) =>
    render(
      <SourcePicker
        context={context()} demanded={demanded} sourceId={sourceId} onSourceChange={() => {}}
        onDbChange={onDbChange} withStatus={false}
      />,
    )

  it('liste les bases du module Données, sans menu natif', async () => {
    const { container } = showDb('pim.products')
    expect(container.querySelector('select')).toBeNull()
    fireEvent.click(screen.getByText('Base de données').parentElement!.querySelector('button')!)
    expect(await screen.findByText(/Catalogue_GSB_2026/)).toBeTruthy()
    expect(screen.getByText(/Makita/)).toBeTruthy()
  })

  it('offre toujours de rendre la main à la feuille ouverte', async () => {
    showDb('pim.products')
    fireEvent.click(screen.getByText('Base de données').parentElement!.querySelector('button')!)
    // Deux occurrences : le libellé du bouton fermé, et l'entrée de la liste ouverte.
    expect(await screen.findAllByText(/Feuille ouverte/)).toHaveLength(2)
  })

  it('⚠ le choix REMONTE, identifiant ET nom : le nom sert à nommer une base disparue', async () => {
    const onDbChange = vi.fn()
    showDb('pim.products', [], onDbChange)
    fireEvent.click(screen.getByText('Base de données').parentElement!.querySelector('button')!)
    fireEvent.click(await screen.findByText(/Makita/))
    expect(onDbChange).toHaveBeenCalledWith('db2', 'Makita')
  })

  it('⚠ absent d’un tableau de veille : aucune base n’a de raison d’y être lue', () => {
    showDb('watch.summary')
    expect(screen.queryByText('Base de données')).toBeNull()
  })

  it('présent dès qu’une TUILE réclame le PIM, même si la liste montre la veille', () => {
    showDb('watch.summary', ['pim.products'])
    expect(screen.getByText('Base de données')).toBeTruthy()
  })

  it('⚠⚠ invisible pour un rôle consultation seule : le choix est PERSISTÉ dans le document', () => {
    render(
      <SourcePicker context={context()} demanded={[]} sourceId="pim.products"
        onSourceChange={() => {}} withStatus={false} />,
    )
    expect(screen.queryByText('Base de données')).toBeNull()
  })
})
