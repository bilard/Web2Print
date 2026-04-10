import { defineString } from 'firebase-functions/params'
import type { DamImageResult, SearchParams, SearchResult } from './types'

const unsplashApiKey = defineString('UNSPLASH_ACCESS_KEY')

const UNSPLASH_BASE = 'https://api.unsplash.com'

function getOrientation(w: number, h: number): 'landscape' | 'portrait' | 'square' {
  const ratio = w / h
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.8) return 'portrait'
  return 'square'
}

export async function searchUnsplash(params: SearchParams): Promise<SearchResult> {
  const url = new URL(`${UNSPLASH_BASE}/search/photos`)
  url.searchParams.set('query', params.query)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('per_page', String(params.perPage))
  if (params.orientation) url.searchParams.set('orientation', params.orientation)
  if (params.color) url.searchParams.set('color', params.color)
  if (params.orderBy) url.searchParams.set('order_by', params.orderBy)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${unsplashApiKey.value()}` },
  })

  if (!res.ok) {
    throw new Error(`Unsplash API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json() as {
    results?: any[]
    total?: number
  }

  const images: DamImageResult[] = (data.results ?? []).map((p: any) => ({
    id: `unsplash_${p.id}`,
    sourceProvider: 'unsplash' as const,
    sourceId: p.id,
    sourceUrl: p.links.html,
    thumbnailUrl: p.urls.small,
    previewUrl: p.urls.regular,
    fullUrl: p.urls.full,
    width: p.width,
    height: p.height,
    photographer: p.user.name,
    photographerUrl: p.user.links.html,
    description: p.description || p.alt_description || '',
    tags: (p.tags ?? []).map((t: any) => t.title).filter(Boolean),
    color: p.color || '#000000',
    orientation: getOrientation(p.width, p.height),
  }))

  return {
    images,
    totalResults: data.total ?? 0,
    hasMore: params.page * params.perPage < (data.total ?? 0),
  }
}
