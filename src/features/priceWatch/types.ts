// src/features/priceWatch/types.ts
// Types partagés du module Veille tarifaire. Pas de dépendance Firebase/React.

export interface TrackedProduct {
  id: string
  sku?: string
  ean?: string
  name: string
  brand?: string
  myPrice?: number
  sourceSheetId?: string
  sourceRowId?: string
}

export interface CompetitorSite {
  id: string
  domain: string // ex: "exemple.com"
  /** Gabarit d'URL avec placeholders {sku} {ean} {name}. Optionnel. */
  urlPattern?: string
  /** Champs à extraire sur ce site (ex: ['price', 'availability']). Défaut : ['price']. */
  fields?: string[]
}

export type MatchStatus = 'auto' | 'confirmed' | 'pending' | 'rejected'

export interface PriceMatch {
  productId: string
  siteId: string
  url?: string
  confidence: number
  status: MatchStatus
  lastPrice?: number
  lastInStock?: boolean
  lastDiscoveredAt?: number
  updatedAt?: number
  // Champs d'affichage dénormalisés : les produits arrivent par le flux (transitoires),
  // donc le tableau de bord lecture-seule lit tout depuis les docs `matches`.
  // myPrice = null (pas undefined) quand absent : Firestore refuse undefined.
  productName?: string
  domain?: string
  myPrice?: number | null
}

export interface HistoryPoint {
  price: number
  inStock?: boolean
  at: number
}

// Interne : référencé par PriceWatchAlert.kind (non exporté — cf. knip).
type AlertKind = 'positioning' | 'competitor-variation'

export interface PriceWatchAlert {
  kind: AlertKind
  productId: string
  productName: string
  siteId: string
  domain: string
  url?: string
  myPrice?: number
  competitorPrice: number
  previousPrice?: number
  variationPct?: number
  message: string
}
