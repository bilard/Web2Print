import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

const KeywordsSchema = z.object({
  keywords: z.array(z.string()).min(1).max(8),
})

const SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 8,
    },
  },
  required: ['keywords'],
}

interface Args {
  clientValues: Record<string, unknown>
  answers: Record<string, unknown>
  nomenclatureName?: string
}

/**
 * Extrait 3 à 6 mots-clés produit à partir du contexte d'un brief.
 * Ces mots-clés servent au scraper à cibler les bonnes catégories sur
 * le site source de la nomenclature.
 */
export async function extractCatalogKeywords({
  clientValues,
  answers,
  nomenclatureName,
}: Args): Promise<string[]> {
  const prompt = `Tu aides un outil de briefs à rechercher les bons produits sur le site d'un fournisseur.

Contexte de la nomenclature : ${nomenclatureName ?? 'non spécifiée'}

Informations client :
${JSON.stringify(clientValues, null, 2)}

Réponses au formulaire dynamique :
${JSON.stringify(answers, null, 2)}

Extrais entre 3 et 6 mots-clés courts (1 à 3 mots chacun) décrivant les FAMILLES DE PRODUITS les plus pertinentes à proposer dans ce brief. Les mots-clés doivent cibler des catégories de catalogue e-commerce, pas des attributs. Exemples : "drapeaux", "oriflammes", "mats télescopiques", "signalétique extérieure".

Réponds UNIQUEMENT avec un JSON { "keywords": [...] }.`

  try {
    const res = await generateJson({
      task: 'brief.catalogKeywords',
      prompt,
      schema: KeywordsSchema,
      schemaForLLM: SCHEMA_FOR_LLM,
      version: 'catalogKeywords@1',
    })
    return res.keywords.map((k) => k.trim()).filter(Boolean)
  } catch (err) {
    console.warn('[extractCatalogKeywords] échec, fallback sur mots-clés vides', err)
    return []
  }
}
