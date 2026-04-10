import { useCallback, useRef } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import type { DamSearchResponse } from '../types'

const searchImagesFn = httpsCallable<unknown, DamSearchResponse>(functions, 'damSearchImages')

export function useDamSearch() {
  const {
    query,
    filters,
    page,
    loading,
    setResults,
    appendResults,
    setLoading,
    setPage,
    addRecentSearch,
  } = useDamStore()

  const abortRef = useRef(0)

  const search = useCallback(async () => {
    if (!query.trim()) return
    const id = ++abortRef.current
    setLoading(true)

    try {
      const orientationMap: Record<string, string | undefined> = {
        all: undefined,
        landscape: 'landscape',
        portrait: 'portrait',
        square: 'squarish',
      }

      const result = await searchImagesFn({
        query: filters.category ? `${query} ${filters.category}` : query,
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
      addRecentSearch(query)
    } catch (err) {
      console.error('DAM search failed:', err)
      if (id === abortRef.current) {
        setResults([], 0, false)
      }
    } finally {
      if (id === abortRef.current) {
        setLoading(false)
      }
    }
  }, [query, filters, setResults, setLoading, setPage, addRecentSearch])

  const loadMore = useCallback(async () => {
    if (loading) return
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

      const result = await searchImagesFn({
        query: filters.category ? `${query} ${filters.category}` : query,
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
  }, [query, filters, page, loading, appendResults, setLoading, setPage])

  return { search, loadMore, loading }
}
