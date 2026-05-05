/**
 * Types pour l'enrichissement IA des produits (scraping web + LLM).
 * Les données enrichies sont stockées séparément de la source pour préserver
 * la traçabilité et permettre un affichage côte à côte source / enrichi.
 */

import type { LlmRequestInfo } from '@/features/ai/llmRouter'

export interface EnrichedSpec {
  name: string
  value: string
  /** Groupe / section d'origine (ex: "Informations", "Poids", "Puissance") */
  group?: string
}

export interface EnrichedAdvantage {
  text: string
  /** Groupe / section d'origine (ex: "Nicoll performance", "Nicoll installation") */
  group?: string
}

export interface ProductVariant {
  reference: string
  label: string
  properties: Record<string, string>
}

/**
 * Document attaché au produit (notice, fiche technique, manuel, déclaration…).
 * Toujours triplet name/url/filename — règle universelle scraping : conserver
 * le nom de fichier original pour traçabilité (ex: notice-X12345-fr.pdf).
 */
export interface EnrichedDocument {
  /** Libellé d'affichage tel que vu sur la page (texte du <a>) */
  name: string
  /** URL absolue du document */
  url: string
  /** Nom de fichier original (basename de l'URL, décodé) */
  filename: string
}

/** Prix structurés (TTC, HT, prix barré, promo, éco-participation). */
export interface Pricing {
  /** Prix actuel TTC (ou prix unique si pas de distinction TVA) */
  ttc?: number
  /** Prix HT (B2B principalement) */
  ht?: number
  /** Prix d'origine / barré (avant promotion) */
  original?: number
  /** Économie réalisée (montant et/ou pourcentage) */
  discount?: { amount?: number; percent?: number }
  /** Devise ISO (EUR, USD, GBP…) — défaut : EUR */
  currency: string
  /** Éco-participation (FR uniquement) */
  ecoParticipation?: number
  /** Date fin de promotion (ISO) — depuis JSON-LD `priceValidUntil` */
  validUntil?: string
}

export interface EnrichedProduct {
  /** Nom / titre du produit (rempli par le pipeline depuis JSON-LD ou H1).
   *  Optionnel : peut être absent si le scraping n'a pas pu extraire de titre fiable. */
  name?: string
  /** Description marketing reformulée par l'IA */
  description: string
  /** Fil d'Ariane / catégorisation (ex: ["Outillage", "Perceuses", "Visseuses à chocs"]) */
  breadcrumb?: string[]
  /** Prix indicatif extrait — type ouvert car parfois string (ex: "À partir de 99€").
   *  @deprecated utilise `pricing` pour les prix structurés (TTC/HT/barré/promo). */
  price?: string | number | null
  /** Prix structurés extraits (markdown patterns + JSON-LD `offers`). */
  pricing?: Pricing
  /** Liste d'avantages / points forts (bullet points), avec groupe optionnel */
  advantages: EnrichedAdvantage[]
  /** Spécifications techniques consolidées */
  specifications: EnrichedSpec[]
  /** Variantes produit (références, libellés, couleurs, etc.) */
  variants: ProductVariant[]
  /** URLs d'images produit trouvées lors du scraping */
  images: string[]
  /** Documents PDF / notices / fiches techniques (toujours triplet name/url/filename) */
  documents: EnrichedDocument[]
  /** URL source principale d'où provient le scraping */
  sourceUrl: string | null
  /** URLs alternatives trouvées durant la recherche (pour info) */
  additionalSources: string[]
  /** Timestamp ms de la génération */
  generatedAt: number
  /** Provider de scraping utilisé (pour affichage dans l'UI) */
  scrapingProvider?: string
  /** Provider LLM réellement utilisé (primaire ou fallback) */
  llmProvider?: string
  /** Modèle LLM exact utilisé */
  llmModel?: string
  /** Champs custom issus d'un template utilisateur (hors champs standards).
   *  Clé = nom du champ défini dans le template (ex: "Titres court"),
   *  valeur = string pour champ unique, string[] pour champ liste. */
  customFields?: Record<string, string | string[]>
  /** Vrai si le scraping a renvoyé une page CAPTCHA / challenge bot
   *  (DataDome, Akamai, Cloudflare…) à toutes les sources tentées.
   *  La donnée affichée est probablement vide ou très partielle.
   *  Permet à l'UI d'afficher un bandeau d'alerte avec actions concrètes. */
  blockedByAntiBot?: boolean
}

export type EnrichmentStatus =
  | 'idle'
  | 'searching'   // Recherche de la page produit via Jina
  | 'scraping'    // Extraction du contenu via Jina Reader
  | 'reasoning'   // Claude reformule / structure les données
  | 'done'
  | 'error'

export interface EnrichmentProgress {
  status: EnrichmentStatus
  message: string
}

export interface EnrichmentEntry {
  progress: EnrichmentProgress
  data: EnrichedProduct | null
  error: string | null
  /** Snapshot du dernier payload envoyé au LLM — éphémère, non persisté.
   *  Affiché dans le panneau pour debug (prompt + paramètres). */
  llmRequest?: LlmRequestInfo
  /** Provider/modèle effectivement utilisé pour le dernier appel de raisonnement
   *  (mis à jour par le callback `onProviderUsed` du llmRouter). Affiché dans
   *  l'UI de progression pour transparence (ex: "claude · claude-opus-4-7"). */
  llmUsed?: { provider: string; model: string }
}

/** Clé de cache unique par feuille + ligne. */
export const enrichmentKey = (sheetName: string, rowId: string) => `${sheetName}::${rowId}`
