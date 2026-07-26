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

/** Moteur de scraping forcé pour un site. 'auto' (défaut) = cascade existante
 *  (fetch serveur → Jina → proxies). Honoré par la moisson (node « Sites sources »). */
export type SiteEngine = 'auto' | 'jina' | 'firecrawl' | 'brightdata'

/** Rôle d'un site dans le suivi. Absent = les DEUX (comportement historique).
 *  - 'harvest'  : moisson par catégories seulement (catalogue spécialisé).
 *  - 'directed' : recherche dirigée réf/EAN seulement — le bon canal pour un
 *    généraliste (Leroy Merlin, marketplaces) dont le catalogue est sans rapport
 *    avec la source : le balayer par catégories coûte des heures pour ~0 produit. */
export type SiteMode = 'harvest' | 'directed'

export interface CompetitorSite {
  id: string
  domain: string // ex: "exemple.com"
  /** Gabarit d'URL avec placeholders {sku} {ean} {name}. Optionnel. */
  urlPattern?: string
  /** Champs à extraire sur ce site (ex: ['price', 'availability']). Défaut : ['price']. */
  fields?: string[]
  /** Moteur forcé (node « Sites sources »). Absent = 'auto'. */
  engine?: SiteEngine
  /** Site à prix CONNECTÉS : la moisson passe par la CF `fetchPageHtmlAuth` (login cookie).
   *  Les identifiants vivent en Firestore (users/{uid}.siteCredentials[host]), pas ici. */
  auth?: boolean
  /** Pages par run RÉSERVÉES à ce site. Absent = part du budget commun. Sert à brider un
   *  concurrent coûteux (Bright Data facturé à la requête) sans rationner les gratuits. */
  pageBudget?: number
  /** Canal de relevé de ce site. Absent = moisson ET recherche dirigée. */
  mode?: SiteMode
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
  // Identité RÉELLEMENT relevée chez le concurrent (issue des données structurées
  // JSON-LD : gtin13 + name). Permet de repérer un mauvais appariement dans le
  // comparatif. null (pas undefined) quand absent : Firestore refuse undefined.
  competitorEan?: string | null
  competitorName?: string | null
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

/** Point de la courbe KPI d'un suivi : un par analyse complète.
 *  Vit ici (et non dans `reportStore`) pour que `history.ts` puisse le typer
 *  sans dépendre du store — le store dépend déjà de `history`. */
export interface KpiHistoryPoint {
  at: number
  products: number
  cheaperThanMe: number
  dearerThanMe: number
  aligned: number
  productsUndercut: number
  /** Écart moyen (avgGapPct FIABLE, agrégé serveur) par concurrent à cette analyse.
   *  `s` = siteId, `g` = écart % (null si aucun prix). ABSENT des points écrits avant
   *  cette feature → à traiter comme un trou dans la courbe (jamais 0). */
  comp?: { s: string; g: number | null }[]
  /** Indice tarif base 100 vs médiane marché (kpis.priceIndex) à cette analyse.
   *  Absent des points antérieurs → trou dans la courbe, jamais 0. */
  pi?: number | null
}
