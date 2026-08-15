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
  render(<SourcePicker context={ctx} demanded={demanded} sourceId={sourceId}
    onSourceChange={() => {}} editing={editing} />)

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
    expect(screen.getByText(/n’alimente encore aucune tuile/)).toBeTruthy()
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

// ⚠⚠ Vu chez l'utilisateur : dix bases dans le module Données, et une seule entrée
// « Produits (PIM) » qui désignait implicitement la feuille ouverte AILLEURS.
describe('SourcePicker — choix de la base du PIM', () => {
  // ⚠ `editing` : c'est en construisant qu'on choisit une base pour une source seulement
  // SÉLECTIONNÉE. En consultation, seules les tuiles décident (cf. dernier test).
  const showDb = (sourceId: SourceId, demanded: SourceId[] = [], onDbChange = () => {}, editing = true) =>
    render(
      <SourcePicker
        context={context()} demanded={demanded} sourceId={sourceId} onSourceChange={() => {}}
        onDbChange={onDbChange} withStatus={false} editing={editing}
      />,
    )

  it('liste les bases du module Données, sans menu natif', async () => {
    const { container } = showDb('pim.products')
    expect(container.querySelector('select')).toBeNull()
    fireEvent.click(screen.getByText('Base produits (PIM)').parentElement!.querySelector('button')!)
    expect(await screen.findByText(/Catalogue_GSB_2026/)).toBeTruthy()
    expect(screen.getByText(/Makita/)).toBeTruthy()
  })

  it('offre toujours de rendre la main à la feuille ouverte', async () => {
    showDb('pim.products')
    fireEvent.click(screen.getByText('Base produits (PIM)').parentElement!.querySelector('button')!)
    // Deux occurrences : le libellé du bouton fermé, et l'entrée de la liste ouverte.
    // ⚠ L'entrée par défaut DIT que c'est un comportement (« suivre la feuille ouverte »),
    // et non une base parmi les autres — c'est ce qui la rendait incompréhensible.
    expect(await screen.findAllByText(/Suivre la feuille ouverte/)).toHaveLength(2)
  })

  it('⚠ le choix REMONTE, identifiant ET nom : le nom sert à nommer une base disparue', async () => {
    const onDbChange = vi.fn()
    showDb('pim.products', [], onDbChange)
    fireEvent.click(screen.getByText('Base produits (PIM)').parentElement!.querySelector('button')!)
    fireEvent.click(await screen.findByText(/Makita/))
    expect(onDbChange).toHaveBeenCalledWith('db2', 'Makita')
  })

  it('⚠ absent d’un tableau de veille : aucune base n’a de raison d’y être lue', () => {
    showDb('watch.summary')
    expect(screen.queryByText('Base produits (PIM)')).toBeNull()
  })

  it('présent dès qu’une TUILE réclame le PIM, même si la liste montre la veille', () => {
    showDb('watch.summary', ['pim.products'])
    expect(screen.getByText('Base produits (PIM)')).toBeTruthy()
  })

  it('⚠⚠ invisible pour un rôle consultation seule : le choix est PERSISTÉ dans le document', () => {
    render(
      <SourcePicker context={context()} demanded={[]} sourceId="pim.products"
        onSourceChange={() => {}} withStatus={false} />,
    )
    expect(screen.queryByText('Base produits (PIM)')).toBeNull()
  })

  it('⚠⚠ en CONSULTATION, absent tant qu’aucune TUILE ne lit le PIM', () => {
    // Vu à l'écran : un tableau de veille proposait une liste de bases produits — « google —
    // 1 ligne », « Makita — 1 ligne » — dont le choix ne changeait rien de visible.
    showDb('pim.products', ['watch.summary'], () => {}, false)
    expect(screen.queryByText('Base produits (PIM)')).toBeNull()
  })
})
