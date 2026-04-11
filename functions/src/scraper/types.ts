export interface ScrapedProduct {
  sku: string
  name: string
  description: string
  price: number
  imageUrl: string
  url: string
  magentoCategoryIds?: string[]
  attributes?: Record<string, unknown>
}

export interface ScrapeRequest {
  sourceUrl: string
  keywords?: string[]
  maxProducts?: number
}

export interface ScrapeResponse {
  products: ScrapedProduct[]
  crawledCategories: string[]
  cacheHit: boolean
  warnings: string[]
}
