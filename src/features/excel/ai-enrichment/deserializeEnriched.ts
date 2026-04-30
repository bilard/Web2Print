import type { CellValue } from '@/features/excel/types'
import type { LlmRequestInfo } from '@/features/ai/llmRouter'
import type { EnrichedProduct, EnrichedSpec, EnrichedAdvantage } from './types'
import { parseDocumentsCell } from './documentUtils'
import { sanitizeEnrichedProduct } from './enrichmentSanitize'

export interface DeserializedEnrichment {
  product: EnrichedProduct
  llmRequest: LlmRequestInfo | null
}

/**
 * Désérialise les cellules `ai_*` d'une ligne Excel (format pipe-séparé produit
 * par `useSaveEnrichedProduct.serializeEnriched`) en un objet `EnrichedProduct`
 * + éventuellement le snapshot `LlmRequestInfo` persisté.
 *
 * Retourne `null` si la ligne ne contient aucune donnée enrichie persistée.
 * Utilisé au montage de `EnrichmentPanel` pour rehydrater l'affichage après
 * reload depuis Firestore.
 */
export function deserializeEnrichedFromRow(
  row: Record<string, CellValue> | undefined,
): DeserializedEnrichment | null {
  if (!row) return null

  const description = typeof row.ai_description === 'string' ? row.ai_description : ''
  const breadcrumbRaw = typeof row.ai_breadcrumb === 'string' ? row.ai_breadcrumb : ''
  const advantagesRaw = typeof row.ai_advantages === 'string' ? row.ai_advantages : ''
  const specsRaw = typeof row.ai_specifications === 'string' ? row.ai_specifications : ''
  const imagesRaw = typeof row.ai_images === 'string' ? row.ai_images : ''
  const documentsRaw = typeof row.ai_documents === 'string' ? row.ai_documents : ''
  const sourceUrl = typeof row.ai_source === 'string' && row.ai_source ? row.ai_source : null
  const scraper = typeof row.ai_scraper === 'string' && row.ai_scraper ? row.ai_scraper : undefined
  const llmModel = typeof row.ai_llm_model === 'string' && row.ai_llm_model ? row.ai_llm_model : undefined

  // Rien à restaurer si tous les champs sont vides
  if (!description && !advantagesRaw && !specsRaw && !imagesRaw && !sourceUrl) {
    return null
  }

  const advantages: EnrichedAdvantage[] = advantagesRaw
    ? advantagesRaw.split(' | ').map((s) => s.trim()).filter(Boolean).map((raw) => {
        const groupMatch = raw.match(/^\[([^\]]+)\](.*)$/)
        if (groupMatch) {
          return { text: groupMatch[2].trim(), group: groupMatch[1].trim() }
        }
        return { text: raw }
      })
    : []

  // En-têtes de table dupliqués ("Valeur", "*Valeur*", "Caractéristique"…) —
  // parasites que le scraping recopiait avant qu'on ajoute le filtre dans
  // sanitizeEnriched. On les nettoie aussi au reload des anciennes data.
  const PLACEHOLDER_HEADER_RE = /^[\s*_]*(valeur|value|caract[eé]ristique|description|sp[eé]cification|name|nom|d[eé]signation|propri[eé]t[eé])[\s*_]*$/i
  const BRACKETED_HEADER_RE = /^\s*\[[^[\]()]+\]\s*$/

  const specifications: EnrichedSpec[] = specsRaw
    ? specsRaw
        .split(' | ')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
          // Format optionnel : [Groupe]Nom: Valeur
          let group: string | undefined
          let rest = pair
          const groupMatch = rest.match(/^\[([^\]]+)\](.*)$/)
          if (groupMatch) {
            group = groupMatch[1].trim()
            rest = groupMatch[2].trim()
          }
          const idx = rest.indexOf(':')
          if (idx === -1) return { name: rest, value: '', group }
          return {
            name: rest.slice(0, idx).trim(),
            value: rest.slice(idx + 1).trim(),
            group,
          }
        })
        .filter((s) => {
          if (PLACEHOLDER_HEADER_RE.test(s.value) || PLACEHOLDER_HEADER_RE.test(s.name)) return false
          if (BRACKETED_HEADER_RE.test(s.name)) return false
          return true
        })
    : []

  const images = imagesRaw
    ? imagesRaw.split(' | ').map((s) => s.trim()).filter((u) => /^https?:\/\//.test(u))
    : []

  // Tolère 3 formats : JSON.stringify (canonique), 'titre##url | …' (legacy), URLs brutes (legacy v0)
  const documents = parseDocumentsCell(documentsRaw)

  const llmProvider = llmModel
    ? llmModel.startsWith('claude')
      ? 'claude'
      : llmModel.startsWith('gemini')
        ? 'gemini'
        : llmModel.startsWith('gpt')
          ? 'openai'
          : undefined
    : undefined

  // Restaurer le llmRequest persisté (JSON sérialisé)
  let llmRequest: LlmRequestInfo | null = null
  const llmRequestRaw = typeof row.ai_llm_request === 'string' && row.ai_llm_request
    ? row.ai_llm_request
    : null
  if (llmRequestRaw) {
    try {
      llmRequest = JSON.parse(llmRequestRaw) as LlmRequestInfo
    } catch {
      // JSON corrompu — on ignore
    }
  }

  // Variantes (JSON sérialisé)
  let variants: Array<{ reference: string; label: string; properties: Record<string, string> }> = []
  const variantsRaw = typeof row.ai_variants === 'string' && row.ai_variants ? row.ai_variants : null
  if (variantsRaw) {
    try { variants = JSON.parse(variantsRaw) } catch { /* ignore */ }
  }

  const breadcrumb = breadcrumbRaw
    ? breadcrumbRaw.split(/\s*[›>/»·]\s*/).map(s => s.trim()).filter(Boolean)
    : undefined

  // Sanitize au chargement : les données persistées avant l'introduction des
  // filtres (nav, checkbox, pricing, prose-specs) doivent être nettoyées au
  // re-affichage sans nécessiter de re-enrichissement complet.
  const product = sanitizeEnrichedProduct({
    description,
    breadcrumb: breadcrumb && breadcrumb.length > 0 ? breadcrumb : undefined,
    advantages,
    specifications,
    variants,
    images,
    documents,
    sourceUrl,
    additionalSources: [],
    generatedAt: 0,
    scrapingProvider: scraper,
    llmProvider,
    llmModel,
  })

  return { product, llmRequest }
}
