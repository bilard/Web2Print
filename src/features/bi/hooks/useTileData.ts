// Données d'une tuile : source → lignes → moteur. Mémoïsé par spec ET par lignes : sans
// cela, vingt tuiles branchées en direct recalculeraient tout à chaque battement.
import { useCallback, useMemo, useState } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import { aggregate, type AggregateResult } from '../engine/aggregate'
import { pimRows, rowsFromSheet } from '../engine/rowsFromPim'
import { getSource } from '../registry/sources'
import { effectivePimSource } from '../registry/pim.source'
import type { FilterClause, QuerySpec } from '../types'

export interface TileData {
  result: AggregateResult | null
  state: 'loading' | 'empty' | 'error' | 'ready'
  error?: string
  updatedAt: number | null
  live: boolean
  retry: () => void
}

export function useTileData(query: QuerySpec, globalFilters: FilterClause[]): TileData {
  const products = usePimStore((s) => s.products)
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return useMemo<TileData>(() => {
    try {
      const registered = getSource(query.source)
      // Lot 1 : seule la source client est branchée. Les sources `server` et `snapshot`
      // arrivent au lot 3 — le dire vaut mieux que rendre une tuile vide.
      if (registered.engine !== 'client') {
        return { result: null, state: 'error', error: `Source non encore disponible : ${registered.id}`,
          updatedAt: null, live: false, retry }
      }
      // La source PIM lit la feuille ACTIVE du module Données — ce que l'utilisateur voit
      // réellement — et ne se replie sur le catalogue master (`usePimStore`) que si aucune
      // feuille n'est chargée. Il n'y a pas de signal « catalogue pas encore arrivé » à
      // distinguer d'une absence de donnée : sans l'un ni l'autre, c'est un état `empty`.
      const hasSheet = sheet !== null && sheet.columns.length > 0
      if (!hasSheet && products.length === 0) {
        return { result: null, state: 'empty',
          error: 'Aucune donnée chargée : ouvrez une base dans le module Données ou importez un catalogue.',
          updatedAt: null, live: true, retry }
      }
      // ⚠⚠ `effectivePimSource` est le point de décision UNIQUE (partagé avec `AddTileMenu`) :
      // sans lui, le menu et le moteur pourraient diverger sur les dimensions disponibles.
      const source = registered.id === 'pim.products' ? effectivePimSource(sheet) : registered
      const rows = hasSheet ? rowsFromSheet(sheet) : pimRows(products, [])
      const merged: QuerySpec = { ...query, filters: [...query.filters, ...globalFilters] }
      const result = aggregate(rows, merged, source)
      return {
        result,
        state: result.rows.length ? 'ready' : 'empty',
        updatedAt: Date.now(), live: true, retry,
      }
    } catch (e) {
      return { result: null, state: 'error', error: e instanceof Error ? e.message : String(e),
        updatedAt: null, live: false, retry }
    }
    // `attempt` est une dépendance VOLONTAIRE : c'est ce qui rejoue le calcul sur « réessayer ».
  }, [sheet, products, query, globalFilters, attempt, retry])
}
