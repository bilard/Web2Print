import { z } from 'zod'
import type { CatalogProduct } from '@/features/briefs/catalog/ProductCatalogProvider'

export const VERSION = 'cart-generation-2026-04-07-1'

export const CartItemSuggestionSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
  aiJustification: z.string().min(1),
})

export const CartResponseSchema = z.object({
  items: z.array(CartItemSuggestionSchema).min(1).max(20),
  reasoning: z.string(),
})

export type CartResponse = z.infer<typeof CartResponseSchema>

export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string' },
          quantity: { type: 'integer' },
          aiJustification: { type: 'string' },
        },
        required: ['sku', 'quantity', 'aiJustification'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['items', 'reasoning'],
}

interface BuildOpts {
  clientValues: Record<string, unknown>
  answers: Record<string, unknown>
  catalog: CatalogProduct[]
}

export function buildPrompt({ clientValues, answers, catalog }: BuildOpts): string {
  const catalogSummary = catalog
    .map(
      (p) =>
        `- ${p.sku} | ${p.name} | ${p.price.toFixed(2)} € | ${p.description.slice(0, 120)}`,
    )
    .join('\n')

  return `Tu es un expert commercial en signalétique et PLV. Sur la base d'un brief client et d'un catalogue de produits, propose un panier cohérent (3 à 8 références) qui répond précisément au besoin.

Brief client :
${JSON.stringify(clientValues, null, 2)}

Réponses complémentaires :
${JSON.stringify(answers, null, 2)}

Catalogue disponible :
${catalogSummary}

Contraintes :
- TOUS les SKUs proposés DOIVENT exister exactement dans le catalogue ci-dessus. N'invente AUCUN SKU.
- Quantités positives entières, cohérentes avec le besoin (ex: nombre de points de vente, surface, etc.).
- Pour chaque item, justifie en une phrase pourquoi il répond au besoin.
- Reasoning global : 2-3 phrases sur ta logique de construction du panier.

Réponds en JSON strict conforme au schéma demandé.`
}
