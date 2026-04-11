import { defineString } from 'firebase-functions/params'
import type { DamImageResult, SearchParams, SearchResult } from './types'

const pexelsApiKey = defineString('PEXELS_API_KEY')

const PEXELS_BASE = 'https://api.pexels.com/v1'

function getOrientation(w: number, h: number): 'landscape' | 'portrait' | 'square' {
  const ratio = w / h
  if (ratio > 1.2) return 'landscape'
  if (ratio < 0.8) return 'portrait'
  return 'square'
}

function mapPexelsPhotos(photos: any[]): DamImageResult[] {
  return photos.map((p: any) => ({
    id: `pexels_${p.id}`,
    sourceProvider: 'pexels' as const,
    sourceId: String(p.id),
    sourceUrl: p.url,
    thumbnailUrl: p.src.small,
    previewUrl: p.src.medium,
    fullUrl: p.src.original,
    width: p.width,
    height: p.height,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    description: p.alt || '',
    tags: [],
    color: p.avg_color || '#000000',
    orientation: getOrientation(p.width, p.height),
  }))
}

export async function getPexelsCurated(
  params: Pick<SearchParams, 'page' | 'perPage'>
): Promise<SearchResult> {
  const url = new URL(`${PEXELS_BASE}/curated`)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('per_page', String(params.perPage))

  const res = await fetch(url.toString(), {
    headers: { Authorization: pexelsApiKey.value() },
  })

  if (!res.ok) {
    throw new Error(`Pexels curated API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as {
    photos?: any[]
    total_results?: number
    next_page?: string
  }

  return {
    images: mapPexelsPhotos(data.photos ?? []),
    totalResults: data.total_results ?? 0,
    hasMore: !!data.next_page,
  }
}

export async function searchPexels(params: SearchParams): Promise<SearchResult> {
  const url = new URL(`${PEXELS_BASE}/search`)
  url.searchParams.set('query', params.query)
  url.searchParams.set('page', String(params.page))
  url.searchParams.set('per_page', String(params.perPage))
  if (params.orientation) url.searchParams.set('orientation', params.orientation)
  if (params.color) url.searchParams.set('color', params.color)

  const res = await fetch(url.toString(), {
    headers: { Authorization: pexelsApiKey.value() },
  })

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as {
    photos?: any[]
    total_results?: number
    next_page?: string
  }

  return {
    images: mapPexelsPhotos(data.photos ?? []),
    totalResults: data.total_results ?? 0,
    hasMore: !!data.next_page,
  }
}
