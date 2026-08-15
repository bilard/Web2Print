import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import type { StoredReport } from '@/features/priceWatch/reportStore'
import type { SourceProduct } from '@/features/priceWatch/catalog/match'
import type { CompetitorListing } from '@/features/priceWatch/catalog/competitorListing'
import type { LoadedSourceCatalog } from '@/features/priceWatch/reportStore'
import {
  useWatchLoader, useWatchSourceState, useWatchSelection, resetWatchDataForTest, isWatchSource,
  setWatchStateForTest,
} from './useWatchData'

// Firestore est remplacé à la FRONTIÈRE (les deux fonctions de lecture et les deux hooks
// temps réel) : ce qu'on vérifie ici, c'est la machine à états du module BI — quand une
// lecture part, quand elle ne part PAS, et ce que la tuile a le droit d'afficher.
const loadSourceCatalog = vi.fn()
const loadAllListings = vi.fn()
let report: StoredReport | null = null

vi.mock('@/features/access/useWorkspaceUid', () => ({ useWorkspaceUid: () => 'uid-1' }))
vi.mock('@/features/priceWatch/reportStore', () => ({
  loadSourceCatalog: (...a: unknown[]) => loadSourceCatalog(...a),
}))
vi.mock('@/features/priceWatch/catalog/store', () => ({
  loadAllListings: (...a: unknown[]) => loadAllListings(...a),
}))
vi.mock('@/features/priceWatch/useCatalogReport', () => ({
  useWatchList: () => [{ watchId: 'f1', label: 'F1', updatedAt: 2 }],
  useCatalogReport: () => report,
}))

const storedReport = (over: Partial<StoredReport> = {}): StoredReport => ({
  runAt: 1_000,
  kpis: {
    products: 1, matchedExact: 1, matchedOriginOnly: 0, sites: 1, comparisons: 1,
    cheaperThanMe: 0, aligned: 0, dearerThanMe: 1, ruptures: 0, productsUndercut: 0,
  },
  byCompetitor: [{
    siteId: 'a', domain: 'a.fr', matched: 12, cheaper: 3, ruptures: 1,
    avgGapPct: 10, medGapPct: -4,
    audit: { indexed: 90, pctPrice: 70, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 },
  }],
  sites: [{ siteId: 'b', domain: 'b.fr' }, { siteId: 'a', domain: 'a.fr' }],
  products: [], totalMatched: 1, truncated: false, ...over,
})

const catalog = (over: Partial<LoadedSourceCatalog> = {}): LoadedSourceCatalog => ({
  products: [{ id: 'p1', name: 'Filtre', ref: 'F1', price: 10 } as SourceProduct],
  vatRate: 0.2, expected: 1, sourceRows: 1, partial: false,
  bytes: 0, displayBytes: 0, ms: 3, ...over,
})

beforeEach(() => {
  resetWatchDataForTest()
  report = null
  loadSourceCatalog.mockReset().mockResolvedValue(catalog())
  loadAllListings.mockReset().mockResolvedValue([])
})

describe('isWatchSource', () => {
  it('ne retient que les trois sources branchées', () => {
    expect(isWatchSource('watch.summary')).toBe(true)
    expect(isWatchSource('watch.catalog')).toBe(true)
    expect(isWatchSource('watch.site')).toBe(true)
    // `watch.listings` existe dans le contrat mais n'est branchée sur rien : la traiter
    // comme une source de veille ferait tomber ses tuiles dans un chargement fantôme.
    expect(isWatchSource('watch.listings')).toBe(false)
    expect(isWatchSource('pim.products')).toBe(false)
  })
})

describe('useWatchLoader — ce qui ne se charge PAS', () => {
  it('ne lit ni le catalogue ni les fiches tant qu’aucune tuile ne les réclame', async () => {
    const { result } = renderHook(() => useWatchLoader(['pim.products']))
    await waitFor(() => expect(result.current.watchId).toBe('f1'))
    expect(loadSourceCatalog).not.toHaveBeenCalled()
    expect(loadAllListings).not.toHaveBeenCalled()
  })

  it('choisit le suivi le plus récent par défaut', async () => {
    const { result } = renderHook(() => useWatchLoader([]))
    await waitFor(() => expect(result.current.watchId).toBe('f1'))
    expect(result.current.sites.map((s) => s.domain)).toEqual([])
  })
})

describe('watch.summary', () => {
  it('dit quel geste faire quand le suivi n’a pas encore de rapport', async () => {
    const { result } = renderHook(() => {
      useWatchLoader(['watch.summary'])
      return useWatchSourceState('watch.summary')
    })
    await waitFor(() => expect(result.current.state).toBe('empty'))
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.watch.noReport' })
  })

  it('rend une ligne par concurrent, sans rien charger de lourd', async () => {
    report = storedReport()
    const { result } = renderHook(() => {
      useWatchLoader(['watch.summary'])
      return useWatchSourceState('watch.summary')
    })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.rows[0]).toMatchObject({ domain: 'a.fr', matched: 12, medGapPct: -4 })
    expect(loadSourceCatalog).not.toHaveBeenCalled()
  })

  it('range les concurrents du rapport par domaine pour le sélecteur', async () => {
    report = storedReport()
    const { result } = renderHook(() => useWatchLoader(['watch.summary']))
    await waitFor(() => expect(result.current.sites).toHaveLength(2))
    expect(result.current.sites.map((s) => s.domain)).toEqual(['a.fr', 'b.fr'])
  })
})

describe('watch.catalog', () => {
  it('annonce son avancement en TRANCHES pendant la relecture', async () => {
    let publish: ((d: number, t: number, e: number) => void) | undefined
    loadSourceCatalog.mockImplementation((_u: string, _w: string, onProgress: typeof publish) => {
      publish = onProgress
      return new Promise(() => {}) // jamais résolue : on observe l'état intermédiaire
    })
    const { result } = renderHook(() => {
      useWatchLoader(['watch.catalog'])
      return useWatchSourceState('watch.catalog')
    })
    await waitFor(() => expect(result.current.state).toBe('loading'))
    act(() => publish?.(8, 38, 115_814))
    expect(result.current.progress).toEqual({ done: 8, total: 38, loaded: 0, expected: 115_814 })
  })

  it('rend les lignes du catalogue une fois toutes les tranches relues', async () => {
    const { result } = renderHook(() => {
      useWatchLoader(['watch.catalog'])
      return useWatchSourceState('watch.catalog')
    })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.rows[0]).toMatchObject({ ref: 'F1', price: 10, hasPrice: true })
  })

  it('dit le geste à faire quand le catalogue source n’a jamais été écrit', async () => {
    loadSourceCatalog.mockResolvedValue(null)
    const { result } = renderHook(() => {
      useWatchLoader(['watch.catalog'])
      return useWatchSourceState('watch.catalog')
    })
    await waitFor(() => expect(result.current.state).toBe('empty'))
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.watch.catalogAbsent' })
  })

  it('⚠⚠ rend les chiffres d’un catalogue amputé AVEC leur réserve, jamais en silence', async () => {
    // Un total sous-compté SANS avertissement est le pire résultat ; un écran qui refuse tout
    // n'apprend rien. Les lignes sont là, et la réserve voyage avec elles.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadSourceCatalog.mockResolvedValue(catalog({ partial: true, expected: 115_814 }))
    const { result } = renderHook(() => {
      useWatchLoader(['watch.catalog'])
      return useWatchSourceState('watch.catalog')
    })
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.rows).toHaveLength(1)
    expect(result.current.message).toEqual({
      kind: 'key', key: 'bi.watch.catalogPartial', params: { loaded: 1, expected: 115_814 },
    })
  })

  it('ne pose AUCUNE réserve sur un catalogue complet', () => {
    // Un avertissement permanent finirait par ne plus rien vouloir dire.
    const { result } = renderHook(() => {
      useWatchLoader(['watch.catalog'])
      return useWatchSourceState('watch.catalog')
    })
    return waitFor(() => {
      expect(result.current.state).toBe('ready')
      expect(result.current.message).toBeUndefined()
    })
  })

  it('libère les lignes dès que plus aucune tuile ne réclame la source', async () => {
    const { result, rerender } = renderHook(({ ids }: { ids: string[] }) => {
      useWatchLoader(ids as Parameters<typeof useWatchLoader>[0])
      return useWatchSourceState('watch.catalog')
    }, { initialProps: { ids: ['watch.catalog'] } })
    await waitFor(() => expect(result.current.rows).toHaveLength(1))
    rerender({ ids: ['pim.products'] })
    await waitFor(() => expect(result.current.rows).toEqual([]))
    expect(result.current.state).toBe('idle')
  })
})

describe('watch.site', () => {
  it('réclame un concurrent avant de lire quoi que ce soit', async () => {
    const { result } = renderHook(() => {
      useWatchLoader(['watch.site'])
      return useWatchSourceState('watch.site')
    })
    await waitFor(() => expect(result.current.state).toBe('empty'))
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.watch.noSite' })
    expect(loadAllListings).not.toHaveBeenCalled()
  })

  it('ne tient qu’UN concurrent en mémoire : changer de site remplace les fiches', async () => {
    const of = (name: string): CompetitorListing[] => [{ url: `https://x/${name}`, name, price: 5 }]
    loadAllListings.mockImplementation((_u: string, _w: string, siteId: string) =>
      Promise.resolve(of(siteId)))
    const { result } = renderHook(() => {
      useWatchLoader(['watch.site'])
      return { data: useWatchSourceState('watch.site'), sel: useWatchSelection() }
    })
    await waitFor(() => expect(result.current.data.state).toBe('empty'))
    act(() => result.current.sel.setSiteId('a'))
    await waitFor(() => expect(result.current.data.rows[0]).toMatchObject({ name: 'a' }))
    act(() => result.current.sel.setSiteId('b'))
    await waitFor(() => expect(result.current.data.rows[0]).toMatchObject({ name: 'b' }))
    expect(result.current.data.rows).toHaveLength(1)
    expect(loadAllListings).toHaveBeenCalledTimes(2)
  })

  it('remonte la cause quand les fiches sont illisibles', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loadAllListings.mockRejectedValue(new Error('permission-denied'))
    const { result } = renderHook(() => {
      useWatchLoader(['watch.site'])
      return { data: useWatchSourceState('watch.site'), sel: useWatchSelection() }
    })
    await waitFor(() => expect(result.current.data.state).toBe('empty'))
    act(() => result.current.sel.setSiteId('a'))
    await waitFor(() => expect(result.current.data.state).toBe('error'))
    expect(result.current.data.message).toEqual({
      kind: 'key', key: 'bi.watch.siteFailed', params: { error: 'permission-denied' },
    })
  })
})

// ⚠⚠ Ce que ces tests protègent : un tableau de bord FIGÉ EN SQUELETTE. Remettre les données
// à zéro est juste quand on CHANGE de suivi ; sur le même suivi, plus rien ne les recharge —
// les effets de chargement ne repartent que si leurs dépendances changent, et elles n'ont pas
// bougé. Relevé à l'écran : toutes les tuiles en chargement perpétuel, et le bandeau qui
// annonçait « rien n'est chargé » pour des sources que les tuiles réclamaient pourtant.
describe('sélection du suivi — remise à zéro', () => {
  it('re-choisir le MÊME suivi ne vide RIEN', () => {
    setWatchStateForTest('watch.summary', {
      rows: [{ domain: 'a.fr' }], state: 'ready',
      progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: 1,
    })
    const { result } = renderHook(() => useWatchSelection())
    act(() => result.current.setWatchId('w1'))
    const { result: state } = renderHook(() => useWatchSourceState('watch.summary'))
    // Premier choix : les données d'un AUTRE suivi n'ont rien à faire là.
    expect(state.current.state).toBe('idle')

    setWatchStateForTest('watch.summary', {
      rows: [{ domain: 'a.fr' }], state: 'ready',
      progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: 1,
    })
    act(() => result.current.setWatchId('w1'))
    const { result: again } = renderHook(() => useWatchSourceState('watch.summary'))
    expect(again.current.state).toBe('ready')
  })

  it('re-choisir le MÊME concurrent ne vide pas ses fiches', () => {
    const { result } = renderHook(() => useWatchSelection())
    act(() => result.current.setWatchId('w1'))
    act(() => result.current.setSiteId('s1'))
    setWatchStateForTest('watch.site', {
      rows: [{ ref: 'x' }], state: 'ready',
      progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: 1,
    })
    act(() => result.current.setSiteId('s1'))
    const { result: state } = renderHook(() => useWatchSourceState('watch.site'))
    expect(state.current.state).toBe('ready')
  })

  it('⚠⚠ une synthèse retombée à zéro se REPUBLIE, au lieu de figer les tuiles', async () => {
    report = storedReport()
    const { result } = renderHook(() => useWatchLoader(['watch.summary']))
    await waitFor(() => expect(result.current.watchId).toBeTruthy())
    const ready = renderHook(() => useWatchSourceState('watch.summary'))
    await waitFor(() => expect(ready.result.current.state).toBe('ready'))

    // Quelque chose remet l'état à zéro sans toucher aux dépendances de l'effet.
    act(() => setWatchStateForTest('watch.summary', {
      rows: [], state: 'idle', progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: null,
    }))
    await waitFor(() => {
      const again = renderHook(() => useWatchSourceState('watch.summary'))
      expect(again.result.current.state).toBe('ready')
    })
  })

  it('changer VRAIMENT de suivi vide bien tout', () => {
    // Garder les chiffres du suivi précédent sous le nom du nouveau : aucun libellé ne
    // rattrape ça.
    const { result } = renderHook(() => useWatchSelection())
    act(() => result.current.setWatchId('w1'))
    setWatchStateForTest('watch.summary', {
      rows: [{ domain: 'a.fr' }], state: 'ready',
      progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: 1,
    })
    act(() => result.current.setWatchId('w2'))
    const { result: state } = renderHook(() => useWatchSourceState('watch.summary'))
    expect(state.current.state).toBe('idle')
  })
})
