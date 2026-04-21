import { getFunctions, httpsCallable } from 'firebase/functions'
import { app } from '@/lib/firebase/config'
import type {
  CatalogProduct,
  CatalogSearchFilter,
  ProductCatalogProvider,
} from './ProductCatalogProvider'

interface ScrapeRequest {
  sourceUrl: string
  keywords?: string[]
  maxProducts?: number
}

interface ScrapedProduct {
  sku: string
  name: string
  description: string
  price: number
  imageUrl: string
  url: string
  attributes?: Record<string, unknown>
}

interface ScrapeResponse {
  products: ScrapedProduct[]
  crawledCategories: string[]
  cacheHit: boolean
  warnings: string[]
}

/**
 * Provider catalogue qui délègue le scraping à une Cloud Function générique.
 * Le scraping est contextualisé par des mots-clés extraits du brief.
 */
export class ScrapedCatalogProvider implements ProductCatalogProvider {
  private cache: CatalogProduct[] | null = null
  private readonly callable = httpsCallable<ScrapeRequest, ScrapeResponse>(
    getFunctions(app, 'europe-west1'),
    'scrapeCatalogForBrief',
  )

  constructor(
    private readonly sourceUrl: string,
    private readonly keywords: string[],
    private readonly maxProducts = 200,
  ) {}

  async search(filter: CatalogSearchFilter): Promise<CatalogProduct[]> {
    const products = await this.loadAll()
    if (!filter?.query) return products
    const q = filter.query.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    )
  }

  async getBySku(sku: string): Promise<CatalogProduct | null> {
    const products = await this.loadAll()
    return products.find((p) => p.sku === sku) ?? null
  }

  private async loadAll(): Promise<CatalogProduct[]> {
    if (this.cache) return this.cache
    const res = await this.callable({
      sourceUrl: this.sourceUrl,
      keywords: this.keywords,
      maxProducts: this.maxProducts,
    })
    const data = res.data
    this.cache = data.products.map((p) => ({
      sku: p.sku,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      magentoCategoryIds: [],
      attributes: {
        ...(p.attributes ?? {}),
        sourceUrl: p.url,
        family: (p.attributes?.category as string | undefined) ?? 'Catalogue scrapé',
      },
    }))
    if (data.warnings.length > 0) {
      console.warn('[ScrapedCatalogProvider] warnings', data.warnings)
    }
    return this.cache
  }
}
