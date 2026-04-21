import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

const KeywordsSchema = z.object({
  keywords: z.array(z.string()).min(1).max(12),
})

const SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    keywords: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 12,
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
 * Extrait 6 à 12 mots-clés produit à partir du contexte d'un brief.
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

Extrais entre 6 et 12 mots-clés courts (1 à 3 mots chacun) décrivant les FAMILLES DE PRODUITS les plus pertinentes à proposer dans ce brief. Couvre large pour offrir de la diversité dans le panier (si le brief évoque un événement extérieur, pense à la signalétique, aux supports gonflables, aux textiles, aux stands, aux habillages de mobilier, etc. — pas seulement 1-2 familles). Les mots-clés doivent cibler des catégories de catalogue e-commerce, pas des attributs. Exemples : "drapeaux", "oriflammes", "mats télescopiques", "signalétique extérieure", "bâches", "kakemonos", "stands événementiels", "totems".

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
