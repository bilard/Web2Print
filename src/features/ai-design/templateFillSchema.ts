/**
 * Schéma de l'output LLM pour le remplissage d'un template.
 *
 * Limites de longueur strictement enforcées — empêchent le LLM de produire des
 * copy-blocks interminables comme dans l'ancien pipeline.
 */

import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex #RRGGBB attendu')

const featureSchema = z.object({
  title: z.string().min(1).max(40),
  desc: z.string().min(1).max(120),
  /** Clé de pictoLibrary (ou alias). Le LLM choisit sémantiquement. */
  pictoHint: z.string().max(30).optional(),
})

export const templateFillSchema = z.object({
  templateId: z.string(),
  palette: z.object({
    primary: hexColor,
    secondary: hexColor,
    neutral: hexColor,
    text: hexColor,
  }),
  copy: z.object({
    title: z.string().min(3).max(60),
    tagline: z.string().max(40).optional(),
    subtitle: z.string().max(80).optional(),
    features: z.array(featureSchema).min(0).max(8),
    priceNew: z.string().max(20).optional(),
    priceOld: z.string().max(20).optional(),
    cta: z.string().max(30).optional(),
    mentions: z.string().max(240).optional(),
  }),
  /** Index (0-based) dans le tableau scrapedAssets pour chaque slot image.
   *  Les entrées optionnelles peuvent être omises si le template n'a pas ce slot
   *  ou si aucun asset scrapé ne correspond. */
  assetMappings: z.object({
    logo: z.number().int().min(0).optional(),
    badge: z.number().int().min(0).optional(),
    heroProduct: z.number().int().min(0).optional(),
  }),
})

export type TemplateFillData = z.infer<typeof templateFillSchema>

/** JSON Schema équivalent, consommé par Claude tool-use et Gemini responseSchema.
 *  Respecte les mêmes contraintes de longueur. */
export const templateFillJsonSchema = {
  type: 'object' as const,
  properties: {
    templateId: { type: 'string' as const, description: 'ID du template choisi (voir liste dans le prompt)' },
    palette: {
      type: 'object' as const,
      properties: {
        primary: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        secondary: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        neutral: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        text: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
      },
      required: ['primary', 'secondary', 'neutral', 'text'] as const,
    },
    copy: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, minLength: 3, maxLength: 60, description: 'Titre display MAJ, 3-6 mots max' },
        tagline: { type: 'string' as const, maxLength: 40, description: 'Accroche promo courte affichée dans le header. Ex: "PROFITEZ DE L\'OFFRE MAKITA !"' },
        subtitle: { type: 'string' as const, maxLength: 80, description: 'Sous-titre 1 ligne (nom produit + modèle)' },
        features: {
          type: 'array' as const,
          maxItems: 8,
          items: {
            type: 'object' as const,
            properties: {
              title: { type: 'string' as const, minLength: 1, maxLength: 40 },
              desc: { type: 'string' as const, minLength: 1, maxLength: 120 },
              pictoHint: { type: 'string' as const, maxLength: 30, description: 'Mot-clé pour choisir un picto (voir liste dans le prompt)' },
            },
            required: ['title', 'desc'] as const,
          },
        },
        priceNew: { type: 'string' as const, maxLength: 20 },
        priceOld: { type: 'string' as const, maxLength: 20 },
        cta: { type: 'string' as const, maxLength: 30 },
        mentions: { type: 'string' as const, maxLength: 240 },
      },
      required: ['title', 'features'] as const,
    },
    assetMappings: {
      type: 'object' as const,
      properties: {
        logo: { type: 'number' as const },
        badge: { type: 'number' as const },
        heroProduct: { type: 'number' as const },
      },
    },
  },
  required: ['templateId', 'palette', 'copy', 'assetMappings'] as const,
}
