import { useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import type { DamSearchResponse } from '../types'

const searchImagesFn = httpsCallable<unknown, DamSearchResponse>(functions, 'damSearchImages')

/** Mot-clé par défaut quand aucune recherche n'est fournie — assez générique pour donner
 *  une galerie variée et visuellement neutre à l'ouverture. */
const DEFAULT_QUERY = 'wallpaper'

export function useDamSearch() {
  const loading = useDamStore((s) => s.loading)

  const abortRef = useRef(0)

  const search = useCallback(async () => {
    const { query, filters, setResults, setLoading, setPage, addRecentSearch, setLastError } =
      useDamStore.getState()

    const trimmed = query.trim()
    const id = ++abortRef.current
    setLoading(true)
    setLastError(null)

    try {
      const orientationMap: Record<string, string | undefined> = {
        all: undefined,
        landscape: 'landscape',
        portrait: 'portrait',
        square: 'squarish',
      }

      // Si pas de query → utilise un mot-clé par défaut pour charger une galerie variée
      const baseQuery = trimmed || DEFAULT_QUERY
      const effectiveQuery = filters.category ? `${baseQuery} ${filters.category}` : baseQuery

      const result = await searchImagesFn({
        query: effectiveQuery,
        page: 1,
        perPage: 30,
        source: filters.source,
        orientation: orientationMap[filters.orientation],
        color: filters.color ?? undefined,
        orderBy: filters.sortBy === 'latest' ? 'latest' : 'relevant',
      })

      if (id !== abortRef.current) return

      setResults(result.data.images, result.data.totalResults, result.data.hasMore)
      setPage(1)
      if (trimmed) addRecentSearch(trimmed)
    } catch (err) {
      console.error('DAM search failed:', err)
      if (id === abortRef.current) {
        setResults([], 0, false)
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err && 'message' in err
              ? String((err as any).message)
              : String(err)
        setLastError(message)
      }
    } finally {
      if (id === abortRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const loadMore = useCallback(async () => {
    const { query, filters, page, loading: isLoading, appendResults, setLoading, setPage } =
      useDamStore.getState()

    if (isLoading) return
    const nextPage = page + 1
    const id = ++abortRef.current
    setLoading(true)

    try {
      const orientationMap: Record<string, string | undefined> = {
        all: undefined,
        landscape: 'landscape',
        portrait: 'portrait',
        square: 'squarish',
      }

      const trimmed = query.trim()
      const baseQuery = trimmed || DEFAULT_QUERY
      const effectiveQuery = filters.category ? `${baseQuery} ${filters.category}` : baseQuery

      const result = await searchImagesFn({
        query: effectiveQuery,
        page: nextPage,
        perPage: 30,
        source: filters.source,
        orientation: orientationMap[filters.orientation],
        color: filters.color ?? undefined,
        orderBy: filters.sortBy === 'latest' ? 'latest' : 'relevant',
      })

      if (id !== abortRef.current) return

      appendResults(result.data.images, result.data.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error('DAM loadMore failed:', err)
    } finally {
      if (id === abortRef.current) {
        setLoading(false)
      }
    }
  }, [])

  return { search, loadMore, loading }
}
