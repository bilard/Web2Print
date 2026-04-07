import type { ProductCatalogProvider } from './ProductCatalogProvider'
import { MockCatalogProvider } from './MockCatalogProvider'

/**
 * Choisit l'implémentation runtime du catalogue produit.
 *
 * MVP : toujours `MockCatalogProvider`.
 * Évolution : lire `import.meta.env.VITE_CATALOG_PROVIDER === 'magento'`
 * et retourner `new MagentoCatalogProvider(...)` quand le lot Magento sera livré.
 */
export function getProductCatalog(): ProductCatalogProvider {
  return new MockCatalogProvider()
}
