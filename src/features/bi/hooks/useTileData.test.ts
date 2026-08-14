import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTileData } from './useTileData'
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
})

describe('useTileData', () => {
  it('état `empty` avec message quand ni feuille ni catalogue ne sont chargés', () => {
    const { result } = renderHook(() => useTileData(baseQuery, []))
    expect(result.current.state).toBe('empty')
    expect(result.current.error).toMatch(/aucune donnée/i)
  })

  it('état `error` sur une source non enregistrée', () => {
    const query: QuerySpec = { ...baseQuery, source: 'dam.assets' }
    const { result } = renderHook(() => useTileData(query, []))
    expect(result.current.state).toBe('error')
    expect(result.current.error).toBeTruthy()
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
