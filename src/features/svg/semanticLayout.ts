import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

export type LayoutBlockType = 'price' | 'headline' | 'title' | 'description' | 'mention' | 'unitprice'

export interface LayoutBlock {
  type: LayoutBlockType
  /** Texte composé/nettoyé (multi-ligne avec \n si besoin) */
  text: string
  /** Index dans la liste de textes Vision → bbox précise par union */
  memberIndices: number[]
  /** Pour type=price : valeur réassemblée "X,YY €" */
  priceValue?: string
}

export const LayoutSchema = z.object({
  blocks: z.array(z.object({
    type: z.enum(['price', 'headline', 'title', 'description', 'mention', 'unitprice']),
    text: z.string(),
    memberIndices: z.array(z.number()),
    priceValue: z.string().optional(),
  })),
})

const layoutJsonSchema = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['price', 'headline', 'title', 'description', 'mention', 'unitprice'] },
          text: { type: 'string' },
          memberIndices: { type: 'array', items: { type: 'number' } },
          priceValue: { type: 'string' },
        },
        required: ['type', 'text', 'memberIndices'],
      },
    },
  },
  required: ['blocks'],
} as const

const PROMPT = `Tu analyses une CRÉA PROMOTIONNELLE retail (supermarché). Image fournie + liste de textes OCR (chaque item : index "i", "text", position "xPct"/"yPct" en % de l'image).

Regroupe les textes en BLOCS ÉDITABLES et type chacun :
- "price" : un prix (gros chiffre + €/décimales, souvent composé). Réassemble la valeur exacte dans "priceValue" au format "X,YY €" (virgule décimale). Mets dans "memberIndices" TOUS les index OCR du prix.
- "headline" : accroche promo en capitales ("LES 2 POUR", "-50% SUR LE 2ÈME"…).
- "title" : nom/désignation du produit.
- "description" : texte descriptif, mentions, ingrédients.
- "mention" : petites mentions légales / "Au rayon …".
- "unitprice" : prix au kg/litre ("Le kg : 22,88 €").

RÈGLES STRICTES :
- EXCLUS totalement (n'inclus dans AUCUN bloc) : tout texte appartenant à un LOGO / PICTO / SCEAU / CERTIFICATION / label qualité / origine / marque dessinée (ex "origine France", "élevé sans antibiotique", "le porc français", "filière qualité"), ET tout texte imprimé sur le PACKAGING/PRODUIT photographié.
- "text" = texte propre, lisible, multi-ligne avec \\n si le bloc occupe plusieurs lignes.
- N'invente pas de texte ; n'utilise que les libellés OCR fournis.

Retourne UNIQUEMENT du JSON {"blocks":[…]}.`

/**
 * Structuration sémantique d'une créa via Gemini 3.5 (multimodal). Reçoit l'image
 * + les textes Vision (index/position) ; renvoie des blocs éditables typés, prix
 * composés, logos/pictos/packaging exclus. Échec → [] (le caller fait le fallback).
 */
export async function semanticLayout(
  imageDataUri: string,
  texts: { i: number; text: string; xPct: number; yPct: number }[],
): Promise<LayoutBlock[]> {
  if (texts.length === 0) return []
  const list = texts.map((t) => ({ i: t.i, text: t.text.slice(0, 80), xPct: Math.round(t.xPct), yPct: Math.round(t.yPct) }))
  try {
    const res = await generateJson({
      task: 'design.semanticLayout',
      prompt: `${PROMPT}\n\nTEXTES OCR :\n${JSON.stringify(list)}`,
      schema: LayoutSchema,
      schemaForLLM: layoutJsonSchema,
      schemaForClaude: layoutJsonSchema,
      version: 'semantic-layout-v1',
      imageDataUris: [imageDataUri],
    })
    return res.blocks as LayoutBlock[]
  } catch (err) {
    console.warn('[semanticLayout] failed:', err)
    return []
  }
}
