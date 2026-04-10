export interface DamImage {
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

export interface DamFilters {
  source: 'all' | 'pexels' | 'unsplash'
  orientation: 'all' | 'landscape' | 'portrait' | 'square'
  color: string | null
  category: string | null
  sortBy: 'relevant' | 'latest' | 'popular'
}

export interface DamCollection {
  id: string
  name: string
  description: string
  coverAssetId: string | null
  ownerId: string
  sharedWith: string[]
  visibility: 'private' | 'shared'
  assetIds: string[]
  createdAt: number
  updatedAt: number
}

export interface DamFavorite {
  userId: string
  assetId: string
  createdAt: number
}

export type DamTab = 'stock' | 'my-images' | 'favorites' | 'collections' | 'recent'

export const DAM_CATEGORIES = [
  { id: 'business', label: 'Business', icon: '🏢' },
  { id: 'nature', label: 'Nature', icon: '🌿' },
  { id: 'technology', label: 'Technologie', icon: '💻' },
  { id: 'food', label: 'Food', icon: '🍕' },
  { id: 'sport', label: 'Sport', icon: '🏃' },
  { id: 'travel', label: 'Voyage', icon: '✈️' },
  { id: 'people', label: 'Personnes', icon: '👤' },
  { id: 'art', label: 'Art', icon: '🎨' },
] as const

export const DAM_COLORS = [
  { value: 'red', hex: '#ef4444' },
  { value: 'orange', hex: '#f97316' },
  { value: 'yellow', hex: '#eab308' },
  { value: 'green', hex: '#22c55e' },
  { value: 'blue', hex: '#3b82f6' },
  { value: 'purple', hex: '#8b5cf6' },
  { value: 'pink', hex: '#ec4899' },
  { value: 'white', hex: '#ffffff' },
  { value: 'gray', hex: '#6b7280' },
  { value: 'black', hex: '#111111' },
] as const

export interface DamSearchResponse {
  images: DamImage[]
  totalResults: number
  hasMore: boolean
  nextPage: number
}
