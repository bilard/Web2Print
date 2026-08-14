// Données d'une tuile : source → lignes → moteur. Mémoïsé par spec ET par lignes : sans
// cela, vingt tuiles branchées en direct recalculeraient tout à chaque battement.
import { useCallback, useMemo, useState } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { aggregate, type AggregateResult } from '../engine/aggregate'
import { pimRows } from '../engine/rowsFromPim'
import { getSource } from '../registry/sources'
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
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return useMemo<TileData>(() => {
    // Lot 1 : seule la source client est branchée. Les sources `server` et `snapshot`
    // arrivent au lot 3 — le dire vaut mieux que rendre une tuile vide.
    try {
      const source = getSource(query.source)
      if (source.engine !== 'client') {
        return { result: null, state: 'error', error: `Source non encore disponible : ${source.id}`,
          updatedAt: null, live: false, retry }
      }
      if (products.length === 0) {
        return { result: null, state: 'loading', updatedAt: null, live: true, retry }
      }
      const rows = pimRows(products, [])
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
  }, [products, query, globalFilters, attempt, retry])
}
