import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTileData } from './useTileData'
import { resetWatchDataForTest, setWatchStateForTest as setWatchState } from './useWatchData'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import type { QuerySpec } from '../types'
import type { ExcelColumn, ExcelSheet } from '@/features/excel/types'
import type { Product } from '@/features/pim/types'

const baseQuery: QuerySpec = {
  source: 'pim.products', measures: [{ id: 'count' }], dimensions: [], filters: [],
}

const col = (key: string): ExcelColumn => ({
  key, label: key, fieldType: 'text', detectedType: 'text', isPrimary: false, width: 160,
})

const sheet = (rows: ExcelSheet['rows']): ExcelSheet => ({
  name: 'Feuille 1', columns: [col('marque')], rows, taxonomy: [],
})

const product = (id: string): Product => ({
  _id: id, masterSku: id, masterEan: null, primarySourceId: 's',
  fields: { marque: { value: 'X', winningSourceId: 's' } },
  sourceLinks: [], taxonomyPath: [], needsDedup: false, createdAt: 0, updatedAt: 0,
})

// ⚠ Stores réels (zustand), remis à un état vide avant chaque test — pas de mock du
// module : le hook lit `usePimStore`/`useExcelStore` en direct, c'est ce qu'on vérifie.
beforeEach(() => {
  useExcelStore.setState({ sheets: [], activeSheetIndex: 0 })
  usePimStore.setState({ products: [] })
  resetWatchDataForTest()
})

describe('useTileData', () => {
  // ⚠⚠ On asserte la CLÉ, jamais le texte français : sinon le libellé en dur aurait
  // simplement déménagé dans le test, la barrière resterait verte et l'écran resterait
  // français pour un lecteur anglais ou espagnol.
  it('état `empty` : remonte la CLÉ du catalogue quand ni feuille ni catalogue ne sont chargés', () => {
    const { result } = renderHook(() => useTileData(baseQuery, []))
    expect(result.current.state).toBe('empty')
    expect(result.current.message).toEqual({ kind: 'key', key: 'bi.tile.noDataLoaded' })
  })

  it('une colonne réservée remonte sa CLÉ et la colonne fautive en paramètre', () => {
    useExcelStore.setState({
      sheets: [{ ...sheet([{ _id: 'a', _total: '3' }]), columns: [col('_total')] }],
      activeSheetIndex: 0,
    })
    const { result } = renderHook(() => useTileData(baseQuery, []))
    expect(result.current.state).toBe('error')
    expect(result.current.message).toEqual({
      kind: 'key', key: 'bi.error.reservedColumn', params: { column: '_total' },
    })
  })

  it('état `error` sur une source non enregistrée — message technique, laissé tel quel', () => {
    const query: QuerySpec = { ...baseQuery, source: 'dam.assets' }
    const { result } = renderHook(() => useTileData(query, []))
    expect(result.current.state).toBe('error')
    expect(result.current.message?.kind).toBe('raw')
  })

  it('état `ready`, lignes prises sur la feuille ACTIVE du module Données', () => {
    useExcelStore.setState({ sheets: [sheet([{ _id: 'a', marque: 'X' }])], activeSheetIndex: 0 })
    const { result } = renderHook(() => useTileData(baseQuery, []))
    expect(result.current.state).toBe('ready')
    expect(result.current.result?.rows).toEqual([{ count: 1 }])
  })

  it('sans feuille chargée, se replie sur le catalogue master (`usePimStore`)', () => {
    usePimStore.setState({ products: [product('p1'), product('p2')] })
    const { result } = renderHook(() => useTileData(baseQuery, []))
    expect(result.current.state).toBe('ready')
    expect(result.current.result?.rows).toEqual([{ count: 2 }])
  })
})

// ⚠⚠ Les sources de veille ne se chargent PAS ici : `useWatchLoader` (appelé une fois par
// tableau de bord) remplit le store, ce hook ne fait que le lire. Ces cas verrouillent le
// branchement — vingt tuiles ne doivent jamais déclencher vingt relectures.
describe('useTileData — sources de veille', () => {
  const watchQuery: QuerySpec = {
    source: 'watch.summary', measures: [{ id: 'count' }], dimensions: [], filters: [],
  }

  it('`idle` (chargement pas encore parti) se rend en `loading`, jamais en cadre vide', () => {
    // Un « aucune donnée » affiché le temps qu'un effet démarre serait une explication fausse.
    const { result } = renderHook(() => useTileData(watchQuery, []))
    expect(result.current.state).toBe('loading')
    expect(result.current.live).toBe(false)
  })

  it('transmet la CLÉ du refus quand le catalogue source est amputé', () => {
    setWatchState('watch.catalog', {
      rows: [], state: 'error', updatedAt: null,
      message: { kind: 'key', key: 'bi.watch.catalogPartial', params: { loaded: 12, expected: 115_814 } },
      progress: { done: 0, total: 0, loaded: 12, expected: 115_814 },
    })
    const { result } = renderHook(() => useTileData({ ...watchQuery, source: 'watch.catalog' }, []))
    expect(result.current.state).toBe('error')
    expect(result.current.result).toBeNull()
    expect(result.current.message).toEqual({
      kind: 'key', key: 'bi.watch.catalogPartial', params: { loaded: 12, expected: 115_814 },
    })
  })

  it('agrège les lignes chargées, et ne bat EN DIRECT que pour la synthèse', () => {
    setWatchState('watch.summary', {
      rows: [{ domain: 'a.fr', matched: 10 }, { domain: 'b.fr', matched: 5 }],
      state: 'ready', message: undefined, updatedAt: 42,
      progress: { done: 0, total: 0, loaded: 2, expected: 2 },
    })
    const { result } = renderHook(() => useTileData(watchQuery, []))
    expect(result.current.state).toBe('ready')
    expect(result.current.result?.rows).toEqual([{ count: 2 }])
    // Le rapport vient d'un `onSnapshot` : lui seul coule. Le catalogue et les fiches d'un
    // site sont des photos relues à la demande — un point clignotant y mentirait.
    expect(result.current.updatedAt).toBe(42)
    expect(result.current.live).toBe(true)
  })

  it('un catalogue relu n’est PAS en direct', () => {
    setWatchState('watch.catalog', {
      rows: [{ famille: 'Filtration', price: 10 }], state: 'ready', message: undefined,
      updatedAt: 7, progress: { done: 0, total: 0, loaded: 1, expected: 1 },
    })
    const { result } = renderHook(() => useTileData({ ...watchQuery, source: 'watch.catalog' }, []))
    expect(result.current.state).toBe('ready')
    expect(result.current.live).toBe(false)
  })
})
