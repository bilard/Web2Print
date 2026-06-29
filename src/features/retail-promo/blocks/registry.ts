import type { PromoBlockId } from '../promoTypes'
import type { PromoBlockDef } from './types'

const REGISTRY = new Map<PromoBlockId, PromoBlockDef>()

export function registerPromoBlock(def: PromoBlockDef): void {
  REGISTRY.set(def.id, def)
}

export function getPromoBlock(id: PromoBlockId): PromoBlockDef | undefined {
  return REGISTRY.get(id)
}

export function listPromoBlocks(): PromoBlockDef[] {
  return [...REGISTRY.values()]
}

/**
 * No-op — la registration se fait via les imports statiques de `index.ts`.
 * Exporté pour permettre à l'app (Task 11) d'inclure explicitement le bundle
 * de blocs : `import '@/features/retail-promo/blocks'` ou `initPromoBlocks()`.
 */
export function initPromoBlocks(): void {
  // Les 8 blocs s'enregistrent à l'évaluation de leurs modules (via index.ts).
}
