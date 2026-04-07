export interface CatalogProduct {
  sku: string
  name: string
  description: string
  price: number
  imageUrl: string
  magentoCategoryIds?: string[]
  attributes?: Record<string, unknown>
}

export interface CatalogSearchFilter {
  categoryNodeIds?: string[]    // ids de nœuds taxonomie
  magentoCategoryIds?: string[]
  query?: string                // recherche libre dans name + description
  limit?: number
}

export interface ProductCatalogProvider {
  search(filter: CatalogSearchFilter): Promise<CatalogProduct[]>
  getBySku(sku: string): Promise<CatalogProduct | null>
}
