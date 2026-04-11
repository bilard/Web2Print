export type DamSourceProvider = 'pexels' | 'unsplash' | 'project'

export interface DamImage {
  id: string
  sourceProvider: DamSourceProvider
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

export interface DamCropMask {
  /** Normalized 0-1 relative to image width */
  x: number
  /** Normalized 0-1 relative to image height */
  y: number
  /** Normalized 0-1 relative to image width */
  width: number
  /** Normalized 0-1 relative to image height */
  height: number
  /** When false, the mask is stored but not applied */
  enabled: boolean
}

export interface DamVariantEdits {
  zoom: number
  rotation: number
  flipH: boolean
  flipV: boolean
  filters: {
    brightness: number
    contrast: number
    saturation: number
    hue: number
  }
  mask: DamCropMask
}

export interface DamImageVariant {
  id: string
  parentAssetId: string
  parentImageData: {
    sourceProvider: 'pexels' | 'unsplash'
    sourceId: string
    fullUrl: string
    previewUrl: string
    thumbnailUrl: string
    width: number
    height: number
    photographer: string
    description: string
    color: string
    orientation: 'landscape' | 'portrait' | 'square'
    tags: string[]
    photographerUrl: string
    sourceUrl: string
  }
  ownerId: string
  createdAt: number
  updatedAt: number
  name: string
  edits: DamVariantEdits
  renderedUrl: string
  renderedThumbUrl: string
  renderedWidth: number
  renderedHeight: number
}

export type DamTab = 'stock' | 'my-images' | 'favorites' | 'collections' | 'recent' | 'projects' | 'generate' | 'gdrive'

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
