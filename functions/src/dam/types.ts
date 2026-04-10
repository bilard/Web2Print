export interface DamImageResult {
  id: string
  sourceProvider: 'pexels' | 'unsplash'
  sourceId: string
  sourceUrl: string
  thumbnailUrl: string
  previewUrl: string
  fullUrl: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  description: string
  tags: string[]
  color: string
  orientation: 'landscape' | 'portrait' | 'square'
}

export interface SearchParams {
  query: string
  page: number
  perPage: number
  orientation?: 'landscape' | 'portrait' | 'squarish'
  color?: string
  orderBy?: 'relevant' | 'latest'
}

export interface SearchResult {
  images: DamImageResult[]
  totalResults: number
  hasMore: boolean
}
