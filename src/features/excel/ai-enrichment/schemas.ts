import { z } from 'zod'

// ── Schemas Zod pour la réponse LLM ─────────────────────────────────────────

export const enrichedSpecSchema = z.object({
  name: z.string(),
  value: z.string(),
  group: z.string().optional(),
})

export const enrichedVariantSchema = z.object({
  reference: z.string(),
  label: z.string(),
  properties: z.record(z.string(), z.string()),
})

export const enrichedProductSchema = z.object({
  description: z.string(),
  advantages: z.array(z.string()),
  specifications: z.array(enrichedSpecSchema),
  variants: z.array(enrichedVariantSchema).optional().default([]),
  images: z.array(z.string()),
  documents: z.array(z.string()),
  heroImage: z.string().optional(),
  price: z.object({
    amount: z.number(),
    currency: z.string(),
    priceType: z.enum(['TTC', 'HT', 'unit']).optional(),
  }).nullable().optional(),
})

export const enrichedProductJsonSchema = {
  type: 'object',
  properties: {
    description: {
      type: 'string',
      description: 'Description marketing riche (2 à 4 phrases), en français, ton professionnel et engageant.',
    },
    advantages: {
      type: 'array',
      items: { type: 'string' },
      description: 'TOUS les points forts / bénéfices utilisateur, phrase courte chacun. Ne pas limiter le nombre.',
    },
    specifications: {
      type: 'array',
      description: 'TOUTES les spécifications techniques disponibles au format {name, value, group}. Ne pas limiter : inclure chaque caractéristique trouvée. Organiser par groupes (Informations, Poids, Puissance, Décibels, Vibrations, Dimensions, Batterie, Perçage, Vissage, etc.).',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom de la spécification (ex: "Couple max", "Poids", "Tension")' },
          value: { type: 'string', description: 'Valeur de la spécification (ex: "135 Nm", "2.3 kg", "18 V")' },
          group: { type: 'string', description: 'Groupe/section de la spécification (ex: "PUISSANCE", "POIDS", "INFORMATIONS", "DÉCIBELS", "VIBRATIONS"). Obligatoire.' },
        },
        required: ['name', 'value', 'group'],
      },
    },
    variants: {
      type: 'array',
      description: 'Variantes / déclinaisons du produit (références, couleurs, tailles, conditionnements). Chaque variante a une référence, un libellé et des propriétés. Si aucune variante, retourner un tableau vide.',
      items: {
        type: 'object',
        properties: {
          reference: { type: 'string', description: 'Code/référence unique de la variante (SKU, code article, numéro de modèle)' },
          label: { type: 'string', description: 'Libellé / désignation de la variante' },
          properties: {
            type: 'object',
            description: 'Propriétés spécifiques de la variante (Couleur, Taille, Conditionnement, etc.)',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['reference', 'label', 'properties'],
      },
    },
    images: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des meilleures images produit trouvées (reprendre telles quelles depuis les données scrapées).',
    },
    documents: {
      type: 'array',
      items: { type: 'string' },
      description: 'URLs complètes des documents téléchargeables (PDF, notices, fiches techniques, déclarations CE). Reprendre les URLs telles quelles depuis les données scrapées.',
    },
    heroImage: {
      type: 'string',
      description: 'URL de LA meilleure image produit (hero shot / image principale / première photo produit). Doit être une URL présente dans les images scrapées. Ne jamais inventer.',
    },
    price: {
      type: 'object',
      nullable: true,
      description: "Prix du produit si visible dans la page (JSON-LD Offer, balise price, texte 'XX,XX €'). Omettre ou null si absent. Ne jamais inventer.",
      properties: {
        amount: { type: 'number', description: 'Valeur numérique (ex: 323.44)' },
        currency: { type: 'string', description: 'Code ISO 4217 : EUR, USD, TND, GBP' },
        priceType: { type: 'string', enum: ['TTC', 'HT', 'unit'], description: 'TTC si mention TTC/incl. VAT, HT si HT/excl. VAT, unit sinon' },
      },
      required: ['amount', 'currency'],
    },
  },
  required: ['description', 'advantages', 'specifications', 'variants', 'images', 'documents'],
} as const
