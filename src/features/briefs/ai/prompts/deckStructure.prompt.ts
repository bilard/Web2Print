import { z } from 'zod'
import type { Brief } from '@/features/briefs/types'

export const VERSION = 'deck-structure-2026-04-07-1'

// Union discriminée alignée sur SlideSpec (types.ts).
export const SlideSpecSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    heroPrompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('context'),
    title: z.string().min(1),
    bullets: z.array(z.string()).min(1).max(6),
  }),
  z.object({
    type: z.literal('product_grid'),
    title: z.string().min(1),
    productSkus: z.array(z.string()).min(1),
    layout: z.enum(['2x2', '3x2', '1x3']),
  }),
  z.object({
    type: z.literal('product_focus'),
    title: z.string().min(1),
    productSku: z.string().min(1),
    keyPoints: z.array(z.string()).min(1).max(5),
    imagePrompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('budget'),
    title: z.string().min(1),
    showTotal: z.boolean(),
    showItemized: z.boolean(),
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string().min(1),
    message: z.string().min(1),
    contactEmail: z.string().optional(),
  }),
])

export const DeckResponseSchema = z.object({
  slides: z.array(SlideSpecSchema).min(3).max(10),
  reasoning: z.string(),
})

export type DeckResponse = z.infer<typeof DeckResponseSchema>

export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['cover', 'context', 'product_grid', 'product_focus', 'budget', 'cta'],
          },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          heroPrompt: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          productSkus: { type: 'array', items: { type: 'string' } },
          layout: { type: 'string', enum: ['2x2', '3x2', '1x3'] },
          productSku: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          imagePrompt: { type: 'string' },
          showTotal: { type: 'boolean' },
          showItemized: { type: 'boolean' },
          message: { type: 'string' },
          contactEmail: { type: 'string' },
        },
        required: ['type', 'title'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['slides', 'reasoning'],
}

interface BuildOpts {
  brief: Brief
}

export function buildPrompt({ brief }: BuildOpts): string {
  const cartLines =
    brief.cart?.items
      .map((it) => `- ${it.sku} | ${it.name} | qté ${it.quantity}`)
      .join('\n') ?? '(panier vide)'

  return `Tu es un commercial expert en signalétique et PLV. Construis la structure d'un deck commercial cohérent pour présenter cette offre à un client. 4 à 8 slides au total.

Brief client :
${JSON.stringify(brief.client.values, null, 2)}

Réponses complémentaires :
${JSON.stringify(brief.dynamicForm?.answers ?? {}, null, 2)}

Panier proposé :
${cartLines}

Contraintes structurelles :
- Première slide OBLIGATOIRE : type="cover" avec un heroPrompt évocateur (1-2 phrases visuelles, en anglais, décrivant un visuel hero photoréaliste pour l'environnement du client).
- Au moins UNE slide "context" qui résume les enjeux du client en 3-5 bullets.
- Au moins UNE slide "product_grid" OU plusieurs "product_focus" couvrant les SKUs du panier. Pour product_focus, l'imagePrompt est une description visuelle anglaise du produit en situation chez le client (1-2 phrases).
- UNE slide "budget" obligatoire (showTotal: true, showItemized: true par défaut).
- DERNIÈRE slide OBLIGATOIRE : type="cta" avec un message d'engagement court.

Contraintes de validité :
- Tous les SKUs cités doivent appartenir au panier.
- Les champs obligatoires de chaque type doivent être présents (cf schéma JSON).
- Les imagePrompts (cover.heroPrompt, product_focus.imagePrompt) doivent être en anglais, descriptifs, sans logo ni texte intégré.

Réponds en JSON strict conforme au schéma demandé. Ajoute un champ reasoning de 2-3 phrases.`
}
