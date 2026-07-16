/**
 * Alignement LLM des specs SOURCE ⇄ FABRICANT non couvertes par le dictionnaire.
 *
 * Le LLM ne fait QUE rapprocher deux libellés équivalents (« Vitesse » ↔ « Régime
 * à vide ») — il ne lit ni ne réécrit jamais les VALEURS (feedback_llm_never_gates
 * / feedback_scraping_verbatim). Appelé une seule fois au scrape fabricant : le
 * résultat est mis en cache dans la fiche (ai_mfr_alignment).
 */

import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { canonicalizeSpecName, normalizeSpecLabel } from './specSynonyms'
import type { LlmSpecPairs } from './types'

const PairsSchema = z.object({
  pairs: z.array(z.object({
    source: z.string().describe('Libellé de spec côté source (revendeur), copié verbatim.'),
    manufacturer: z.string().describe('Libellé de spec équivalent côté fabricant, copié verbatim.'),
  })),
})

const pairsJsonSchema = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { source: { type: 'string' }, manufacturer: { type: 'string' } },
        required: ['source', 'manufacturer'],
      },
    },
  },
  required: ['pairs'],
} as const

/**
 * Rapproche les specs non alignées par le dictionnaire.
 * @returns paires normalisées `{ [normalizeSpecLabel(source)]: normalizeSpecLabel(manufacturer) }`
 *          — directement consommables par `compareSourceVsManufacturer`.
 */
export async function alignUnknownSpecs(
  source: EnrichedProduct,
  mfr: EnrichedProduct,
): Promise<LlmSpecPairs> {
  // 1. Ne garder QUE les libellés que le dictionnaire ne sait pas rapprocher.
  const srcLeft = source.specifications
    .map((s) => s.name)
    .filter((n) => !canonicalizeSpecName(n))
  const mfrLeft = mfr.specifications
    .map((s) => s.name)
    .filter((n) => !canonicalizeSpecName(n))
  if (srcLeft.length === 0 || mfrLeft.length === 0) return {}

  const prompt = `Tu alignes des noms de caractéristiques techniques entre deux fiches d'un MÊME produit : une fiche revendeur (SOURCE) et la fiche officielle du FABRICANT.

Ta seule tâche : rapprocher les libellés qui désignent la MÊME caractéristique, même s'ils sont formulés différemment (ex : "Vitesse" ↔ "Régime à vide", "Poids" ↔ "Masse avec batterie").

Règles STRICTES :
- N'invente aucune paire douteuse. Dans le doute, n'apparie pas.
- Copie les libellés VERBATIM (exactement comme fournis).
- Un libellé source ne peut correspondre qu'à UN seul libellé fabricant.
- Ne rapproche PAS deux caractéristiques différentes (ex : "Couple dur" ≠ "Couple tendre").

SOURCE (revendeur) :
${srcLeft.map((n) => `- ${n}`).join('\n')}

FABRICANT :
${mfrLeft.map((n) => `- ${n}`).join('\n')}

Retourne UNIQUEMENT le JSON des paires certaines.`

  try {
    const res = await generateJson({
      task: 'product.specAlignment',
      prompt,
      schema: PairsSchema,
      schemaForLLM: pairsJsonSchema,
      schemaForClaude: pairsJsonSchema,
      version: 'spec-align-v1',
    })
    const out: LlmSpecPairs = {}
    const srcSet = new Set(srcLeft.map(normalizeSpecLabel))
    const mfrSet = new Set(mfrLeft.map(normalizeSpecLabel))
    for (const p of res.pairs) {
      const s = normalizeSpecLabel(p.source)
      const m = normalizeSpecLabel(p.manufacturer)
      // Garde-fou : n'accepter que des libellés réellement présents des deux côtés.
      if (s && m && srcSet.has(s) && mfrSet.has(m)) out[s] = m
    }
    return out
  } catch (err) {
    console.warn('[manufacturer-verify] alignUnknownSpecs failed:', err)
    return {}
  }
}
