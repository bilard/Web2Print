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

export interface EnrichedProduct {
  /** Description marketing reformulée par l'IA */
  description: string
  /** Liste d'avantages / points forts (bullet points), avec groupe optionnel */
  advantages: EnrichedAdvantage[]
  /** Spécifications techniques consolidées */
  specifications: EnrichedSpec[]
  /** Variantes produit (références, libellés, couleurs, etc.) */
  variants: ProductVariant[]
  /** URLs d'images produit trouvées lors du scraping */
  images: string[]
  /** URLs des documents PDF / notices / fiches techniques */
  documents: string[]
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
}

/** Clé de cache unique par feuille + ligne. */
export const enrichmentKey = (sheetName: string, rowId: string) => `${sheetName}::${rowId}`
