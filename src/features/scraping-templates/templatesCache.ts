// Cache mémoire des templates de scraping (TTL 30 s) et notification des hooks
// actifs à l'invalidation.
//
// Vit dans son propre module — sans importer ni le store ni le hook — pour que
// `templatesStore` puisse invalider après une écriture Firestore sans dépendre
// d'un module React, et que le hook puisse lire le cache sans cycle.
import type { ScrapingTemplate } from './types'

const CACHE_TTL_MS = 30_000

let cached: ScrapingTemplate[] | null = null
let cachedAt = 0

const invalidationListeners = new Set<() => void>()

/** Templates encore frais, ou `null` si le cache est vide ou expiré. */
export function readTemplatesCache(): ScrapingTemplate[] | null {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached
  return null
}

/** Dernier contenu connu, TTL ignoré — repli quand le fetch échoue. */
export function peekTemplatesCache(): ScrapingTemplate[] | null {
  return cached
}

export function writeTemplatesCache(templates: ScrapingTemplate[]): void {
  cached = templates
  cachedAt = Date.now()
}

/** Invalide le cache ET notifie tous les hooks actifs pour qu'ils refetch. */
export function invalidateTemplatesCache(): void {
  cached = null
  cachedAt = 0
  invalidationListeners.forEach((fn) => {
    try {
      fn()
    } catch {
      // Un listener démonté ne doit pas empêcher les autres d'être notifiés.
    }
  })
}

/** S'abonne aux invalidations. Retourne la fonction de désabonnement. */
export function onTemplatesInvalidated(listener: () => void): () => void {
  invalidationListeners.add(listener)
  return () => {
    invalidationListeners.delete(listener)
  }
}
