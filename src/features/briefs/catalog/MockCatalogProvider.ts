import type {
  CatalogProduct,
  CatalogSearchFilter,
  ProductCatalogProvider,
} from './ProductCatalogProvider'
import seed from './mock-catalog.json'

export class MockCatalogProvider implements ProductCatalogProvider {
  private readonly products: CatalogProduct[]

  constructor(products?: CatalogProduct[]) {
    this.products = products ?? (seed as CatalogProduct[])
  }

  async search(filter: CatalogSearchFilter): Promise<CatalogProduct[]> {
    const { magentoCategoryIds, query, limit } = filter
    const q = query?.trim().toLowerCase()

    let result = this.products.filter((p) => {
      if (magentoCategoryIds && magentoCategoryIds.length > 0) {
        const intersect = (p.magentoCategoryIds ?? []).some((c) =>
          magentoCategoryIds.includes(c),
        )
        if (!intersect) return false
      }
      if (q) {
        const haystack = `${p.name} ${p.description}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    if (typeof limit === 'number' && limit >= 0) {
      result = result.slice(0, limit)
    }
    return result
  }

  async getBySku(sku: string): Promise<CatalogProduct | null> {
    return this.products.find((p) => p.sku === sku) ?? null
  }
}
