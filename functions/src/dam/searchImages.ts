// functions/src/dam/searchImages.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { searchPexels, getPexelsCurated } from './pexelsClient'
import { searchUnsplash, getUnsplashCurated } from './unsplashClient'
import type { DamImageResult } from './types'

const cache = new Map<string, { data: any; expires: number }>()
const CACHE_TTL = 5 * 60 * 1000

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expires) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL })
  if (cache.size > 500) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now > v.expires) cache.delete(k)
    }
  }
}

export const searchImages = onCall(
  { region: 'europe-west1', maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentification requise')
    }

    const { query, page = 1, perPage = 15, source = 'all', orientation, color, orderBy } =
      request.data as {
        query: string
        page?: number
        perPage?: number
        source?: 'all' | 'pexels' | 'unsplash'
        orientation?: 'landscape' | 'portrait' | 'squarish'
        color?: string
        orderBy?: 'relevant' | 'latest'
      }

    if (query !== undefined && typeof query !== 'string') {
      throw new HttpsError('invalid-argument', 'query doit être une chaîne')
    }

    const normalizedQuery = (query ?? '').trim()
    const isCurated = normalizedQuery.length === 0

    const cacheKey = JSON.stringify({
      query: normalizedQuery,
      page,
      perPage,
      source,
      orientation,
      color,
      orderBy,
      curated: isCurated,
    })
    const cached = getCached<any>(cacheKey)
    if (cached) return cached

    const params = { query: normalizedQuery, page, perPage, orientation, color, orderBy }
    const curatedParams = { page, perPage }
    const promises: Promise<{ images: DamImageResult[]; totalResults: number; hasMore: boolean }>[] = []

    if (source === 'all' || source === 'pexels') {
      promises.push(
        (isCurated ? getPexelsCurated(curatedParams) : searchPexels(params)).catch(() => ({
          images: [],
          totalResults: 0,
          hasMore: false,
        }))
      )
    }
    if (source === 'all' || source === 'unsplash') {
      promises.push(
        (isCurated ? getUnsplashCurated(curatedParams) : searchUnsplash(params)).catch(() => ({
          images: [],
          totalResults: 0,
          hasMore: false,
        }))
      )
    }

    const results = await Promise.all(promises)

    const seen = new Set<string>()
    const allImages: DamImageResult[] = []
    for (const r of results) {
      for (const img of r.images) {
        const key = `${img.sourceProvider}_${img.sourceId}`
        if (!seen.has(key)) {
          seen.add(key)
          allImages.push(img)
        }
      }
    }

    // Interleave sources for variety
    if (source === 'all' && results.length === 2) {
      const pexelsImgs = allImages.filter((i) => i.sourceProvider === 'pexels')
      const unsplashImgs = allImages.filter((i) => i.sourceProvider === 'unsplash')
      allImages.length = 0
      const maxLen = Math.max(pexelsImgs.length, unsplashImgs.length)
      for (let i = 0; i < maxLen; i++) {
        if (i < pexelsImgs.length) allImages.push(pexelsImgs[i])
        if (i < unsplashImgs.length) allImages.push(unsplashImgs[i])
      }
    }

    const totalResults = results.reduce((sum, r) => sum + r.totalResults, 0)
    const hasMore = results.some((r) => r.hasMore)

    const response = { images: allImages, totalResults, hasMore, nextPage: page + 1 }
    setCache(cacheKey, response)
    return response
  }
)
