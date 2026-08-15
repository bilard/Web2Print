// ⚠⚠ `saveDashboard` écrit avec `setDoc`, qui REMPLACE le document : TOUTE écriture réécrit
// les pages, y compris celle qu'elle ne prétend pas toucher. Or `current` vient de
// l'abonnement Firestore et retarde d'un aller-retour. Ce fichier tient la conséquence :
// AUCUN geste anodin (renommer, changer de base source, vider les filtres, ajouter un onglet)
// ne doit défaire le déplacement ou la reconfiguration qu'on vient de faire.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act as reactAct } from '@testing-library/react'
import { useBoardActions } from './useBoardActions'
import { parseDashboard, type Dashboard, type Tile, type TilePlacement } from '../types'

const saveDashboard = vi.fn<(uid: string, d: unknown) => Promise<void>>()
vi.mock('../store/dashboardsStore', () => ({
  saveDashboard: (uid: string, d: unknown) => saveDashboard(uid, d),
}))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }))

const tile = (id: string, measure: string): Tile => ({
  id, kind: 'kpi', title: id,
  query: { source: 'pim.products', measures: [{ id: measure }], dimensions: [], filters: [] },
})

/** Mise en page ENREGISTRÉE : c'est celle que `current` porte encore après un déplacement. */
const OLD: TilePlacement[] = [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }]
/** Mise en page à l'écran, déjà validée mais dont l'écho n'est pas revenu. */
const MOVED: TilePlacement[] = [{ tileId: 't1', x: 6, y: 4, w: 3, h: 2 }]

const CURRENT: Dashboard = {
  id: 'd1', name: 'Ventes', accountId: 'acme', workspaceUid: 'u1',
  tiles: [tile('t1', 'count')], layout: OLD, filters: [],
  version: 1, createdAt: 1, updatedAt: 1, createdBy: 'u1',
  pages: [{ id: 'p1', name: 'Ventes', tiles: [tile('t1', 'count')], layout: OLD }],
}

/** Le document réellement envoyé, relu par le VRAI contrat — jamais inspecté à la main. */
const written = () => parseDashboard(saveDashboard.mock.calls.at(-1)![1])
const writtenPage = () => written().pages.find((p) => p.id === 'p1')!

beforeEach(() => saveDashboard.mockReset().mockResolvedValue(undefined))

const mount = () => renderHook(() => useBoardActions('u1', CURRENT, 'p1'))

describe('useBoardActions — l’écriture part de ce que l’ÉCRAN montre', () => {
  it('⚠⚠ renommer n’annule PAS le déplacement qu’on vient de faire', () => {
    const { result } = mount()
    // L'écran a validé un déplacement ; `current`, lui, porte encore l'ancienne place.
    reactAct(() => result.current.trackPage(CURRENT.pages[0].tiles, MOVED))

    reactAct(() => result.current.rename('Ventes B2B'))

    expect(written().name).toBe('Ventes B2B')
    expect(writtenPage().layout).toEqual(MOVED)
  })

  it('⚠⚠ renommer n’annule PAS la reconfiguration qu’on vient de faire', () => {
    const { result } = mount()
    const reconfigured = [tile('t1', 'pim.completeness')]
    reactAct(() => result.current.trackPage(reconfigured, OLD))

    reactAct(() => result.current.rename('Ventes B2B'))

    expect(writtenPage().tiles[0].query.measures).toEqual([{ id: 'pim.completeness' }])
  })

  it('⚠⚠ changer de base source n’annule pas le déplacement non plus', () => {
    const { result } = mount()
    reactAct(() => result.current.trackPage(CURRENT.pages[0].tiles, MOVED))

    reactAct(() => result.current.setSourceDb('db1', 'Catalogue_GSB_2026'))

    expect(written().sourceDbId).toBe('db1')
    expect(writtenPage().layout).toEqual(MOVED)
  })

  it('⚠ vider les filtres non plus', () => {
    const { result } = mount()
    reactAct(() => result.current.trackPage(CURRENT.pages[0].tiles, MOVED))

    reactAct(() => result.current.clearFilters())

    expect(written().filters).toEqual([])
    expect(writtenPage().layout).toEqual(MOVED)
  })

  it('⚠ ajouter un onglet non plus — la page qu’on QUITTE garde ses gestes', () => {
    const { result } = mount()
    reactAct(() => result.current.trackPage(CURRENT.pages[0].tiles, MOVED))

    reactAct(() => { result.current.addPage(CURRENT.pages) })

    expect(written().pages).toHaveLength(2)
    expect(writtenPage().layout).toEqual(MOVED)
  })

  it('⚠ une mise en page validée reste acquise pour l’écriture SUIVANTE (undo/redo enchaînés)', () => {
    const { result } = mount()
    // `persistLayout` est appelé de façon SYNCHRONE par `undo`/`redo`, avant tout re-rendu :
    // il doit donc rafraîchir la publication lui-même, sans attendre `trackPage`.
    reactAct(() => result.current.persistLayout(MOVED, CURRENT.pages[0].tiles))
    reactAct(() => result.current.rename('Ventes B2B'))

    expect(writtenPage().layout).toEqual(MOVED)
  })

  it('sans rien de publié, l’écriture repart de `current` — comportement d’avant', () => {
    const { result } = mount()
    reactAct(() => result.current.rename('Ventes B2B'))
    expect(writtenPage().layout).toEqual(OLD)
  })

  it('⚠ une publication venue d’une AUTRE page est ignorée', () => {
    const { result } = renderHook(() => useBoardActions('u1', CURRENT, 'p2'))
    reactAct(() => result.current.trackPage(CURRENT.pages[0].tiles, MOVED))
    reactAct(() => result.current.rename('Ventes B2B'))
    // `p2` n'existe pas dans ce document : rien n'est recousu, rien n'est corrompu.
    expect(writtenPage().layout).toEqual(OLD)
  })
})

// ⚠ Vu à l'écran : un tableau renommé « GSB 2026 » dont l'onglet annonçait toujours
// « Sans titre ». Une page unique n'a pas d'identité propre — elle EST le tableau.
describe('renommage', () => {
  it('renomme la page UNIQUE avec le tableau', () => {
    const { result } = mount()
    reactAct(() => { result.current.rename('GSB 2026') })
    expect(written().name).toBe('GSB 2026')
    expect(written().pages[0].name).toBe('GSB 2026')
  })

  it('⚠ NE touche pas aux noms quand il y a plusieurs pages', () => {
    // Chacune porte alors son propre sujet : les écraser perdrait le travail de l'auteur.
    const twoPages: Dashboard = {
      ...CURRENT,
      pages: [
        { id: 'p1', name: 'Écarts', tiles: [], layout: [] },
        { id: 'p2', name: 'Couverture', tiles: [], layout: [] },
      ],
    }
    const { result } = renderHook(() => useBoardActions('u1', twoPages, 'p1'))
    reactAct(() => { result.current.rename('Veille F1') })
    expect(written().pages.map((p) => p.name)).toEqual(['Écarts', 'Couverture'])
  })
})

describe('une écriture qui ne s’appliquerait à RIEN', () => {
  // ⚠⚠ `replacePage` rend le document INCHANGÉ quand la page visée n'y est plus (rouvert
  // ailleurs, page supprimée d'un autre poste). L'écriture partait quand même et réécrivait
  // à l'identique : le placement semblait « ne pas se sauvegarder », sans le moindre message.
  it('ne part pas, et le DIT, quand la page visée n’existe plus', () => {
    toastError.mockClear()
    const { result } = renderHook(() => useBoardActions('u1', CURRENT, 'page-disparue'))
    reactAct(() => result.current.persistLayout(MOVED, CURRENT.pages[0].tiles))
    expect(saveDashboard).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })

  it('part normalement quand la page est bien là', () => {
    const { result } = mount()
    reactAct(() => result.current.persistLayout(MOVED, CURRENT.pages[0].tiles))
    expect(writtenPage().layout).toEqual(MOVED)
  })
})
