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

// ⚠ `editing` par défaut : ces tests décrivent le CONSTRUCTEUR. En consultation, le choix de
// la source des nouvelles tuiles n'est pas offert — c'est l'objet du dernier bloc.
const show = (sourceId: SourceId, demanded: SourceId[] = [], ctx = context(), editing = true) =>
  render(<SourcePicker context={ctx} demanded={demanded} sourceId={sourceId} editing={editing} />)

describe('SourcePicker', () => {
  it('⚠⚠ n’utilise AUCUN menu natif (spec lot 2, D5)', () => {
    const { container } = show('watch.summary')
    expect(container.querySelector('select')).toBeNull()
  })

  it('ne montre pas de concurrent quand rien ne touche à la veille', () => {
    show('pim.products')
    expect(screen.queryByText('Concurrent')).toBeNull()
  })

  it('⚠⚠ ne porte plus AUCUN choix de source : il vit dans le volet de gauche', () => {
    // Trois sélecteurs — source, suivi, base — encombraient ce bandeau sans lien apparent.
    selectWatch('f1')
    show('watch.summary', ['watch.summary'])
    expect(screen.getByText('Données affichées')).toBeTruthy()
    expect(screen.queryByText('Source des nouvelles tuiles')).toBeNull()
    expect(screen.queryByText('Base produits (PIM)')).toBeNull()
    expect(screen.queryByText('Suivi')).toBeNull()
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

  it('annonce, avec le GESTE à faire, qu’une source n’alimente encore rien', () => {
    // « Rien n'est chargé » constatait sans rien proposer : on reste devant un écran qui
    // paraît en panne. La phrase dit maintenant quoi faire pour que ça charge.
    selectWatch('f1')
    show('watch.catalog')
    expect(screen.getByText(/posez-en une pour la charger/)).toBeTruthy()
  })

  it('⚠ ne redit PAS la limite du moteur serveur une fois par source', () => {
    // Répétée par source, la même phrase occupait deux lignes du bandeau pour une seule
    // information — et poussait les boutons au rang suivant.
    selectWatch('f1')
    show('watch.summary', ['watch.summary', 'watch.catalog'])
    expect(screen.getAllByText(/se lit isolément/)).toHaveLength(1)
  })
})

describe('SourcePicker — en consultation', () => {
  it('⚠⚠ n’offre PAS de changer la source des nouvelles tuiles', () => {
    // Posée là, elle se lit comme le jeu de données du tableau : on la change, l'écran ne
    // bouge pas, et tout paraît cassé.
    selectWatch('f1')
    show('watch.summary', ['watch.summary'], context(), false)
    expect(screen.queryByText('Source des nouvelles tuiles')).toBeNull()
  })

  it('DIT en toutes lettres ce qui alimente l’écran', () => {
    // Un tableau dont on ignore la source ne se vérifie pas.
    selectWatch('f1')
    show('watch.site', ['watch.summary'], context(), false)
    expect(screen.getByText('Données affichées')).toBeTruthy()
    expect(screen.getByText(/synthèse par concurrent/)).toBeTruthy()
  })

  it('⚠ ne propose pas un concurrent qu’aucune tuile ne lit', () => {
    // Le sélectionner ne chargerait rien de visible : c'est exactement le geste qui donnait
    // l'impression que l'écran ne répondait plus.
    selectWatch('f1')
    show('watch.site', ['watch.summary'], context(), false)
    expect(screen.queryByText('Concurrent')).toBeNull()
  })
})

