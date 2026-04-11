import type { ProductCatalogProvider } from './ProductCatalogProvider'
import { MockCatalogProvider } from './MockCatalogProvider'
import { ScrapedCatalogProvider } from './ScrapedCatalogProvider'

interface CatalogContext {
  /** URL du site source de la nomenclature (si définie dans les paramètres). */
  sourceUrl?: string
  /** Mots-clés extraits du contexte du brief pour cibler le scraping. */
  keywords?: string[]
  /** Plafond de produits remontés par le provider (défaut 50). */
  maxProducts?: number
}

/**
 * Choisit l'implémentation runtime du catalogue produit.
 *
 * - Si la nomenclature a une `sourceUrl` → `ScrapedCatalogProvider` (scraping live
 *   via Cloud Function, générique pour n'importe quel site e-commerce)
 * - Sinon → `MockCatalogProvider` (fallback de dev)
 *
 * Le provider scrapé peut lui-même échouer ; l'appelant doit gérer l'erreur
 * et basculer sur le mock si nécessaire (voir `useGenerateCart`).
 */
export function getProductCatalog(ctx: CatalogContext = {}): ProductCatalogProvider {
  if (ctx.sourceUrl && ctx.sourceUrl.trim().length > 0) {
    return new ScrapedCatalogProvider(
      ctx.sourceUrl.trim(),
      ctx.keywords ?? [],
      ctx.maxProducts ?? 50,
    )
  }
  return new MockCatalogProvider()
}
