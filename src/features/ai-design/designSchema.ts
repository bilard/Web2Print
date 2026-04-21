import { z } from 'zod'

export const ImageSlotSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  promptSuggestion: z.string().min(1),
})

export const DesignResultSchema = z.object({
  svg: z.string().min(20).refine((s) => s.includes('<svg'), {
    message: 'Le champ svg doit contenir une balise <svg>',
  }),
  widthMm: z.number().positive().max(2000),
  heightMm: z.number().positive().max(2000),
  bleedMm: z.number().min(0).max(10),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(1).max(8),
  fontsUsed: z.array(z.string()).max(4),
  slots: z.array(ImageSlotSchema).max(8),
  rationale: z.string().min(10).max(2000),
})

// Note : le type `DesignResult` est défini dans `./types.ts` comme interface
// consumer-facing. Le schéma Zod ci-dessus doit rester structurellement
// compatible avec cette interface (voir la vérification de parité dans
// useGenerateDesign.ts via le cast `as unknown as z.ZodSchema<DesignResult>`).

/**
 * JSON Schema équivalent, format attendu par Claude tool-use (`input_schema`).
 * Version manuelle car zod-to-json-schema n'est pas installé et l'ajouter
 * pour ce seul usage serait une dépendance de trop.
 */
export const DesignResultJsonSchema = {
  type: 'object',
  required: ['svg', 'widthMm', 'heightMm', 'bleedMm', 'palette', 'fontsUsed', 'slots', 'rationale'],
  properties: {
    svg: {
      type: 'string',
      description:
        'SVG complet et valide. Doit inclure <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> où W et H sont en millimètres. Pas de <script>, pas d\'handlers onXxx. Les slots images sont des <image href="placeholder:<id>"/>.',
    },
    widthMm:  { type: 'number', description: 'Largeur fini (après coupe), en mm' },
    heightMm: { type: 'number', description: 'Hauteur finie (après coupe), en mm' },
    bleedMm:  { type: 'number', description: 'Fond perdu appliqué, en mm. 0 si non demandé.' },
    palette: {
      type: 'array',
      description: 'Couleurs hex (#RRGGBB) effectivement utilisées dans le design, 1 à 8 entrées.',
      items: { type: 'string' },
    },
    fontsUsed: {
      type: 'array',
      description: 'Familles de polices référencées dans le SVG (doit être un sous-ensemble de la liste fournie)',
      items: { type: 'string' },
    },
    slots: {
      type: 'array',
      description: 'Emplacements image dans le design (un slot par <image href="placeholder:ID"/>).',
      items: {
        type: 'object',
        required: ['id', 'role', 'promptSuggestion'],
        properties: {
          id:   { type: 'string', description: 'Identifiant unique du slot, correspond à placeholder:<id> dans le SVG' },
          role: { type: 'string', description: 'Rôle du slot : hero, background, product, logo…' },
          promptSuggestion: {
            type: 'string',
            description: 'Description courte pour guider une future génération d\'image',
          },
        },
      },
    },
    rationale: {
      type: 'string',
      description: 'Justification concise (1-3 phrases) des choix de composition, hiérarchie et palette',
    },
  },
} as const
