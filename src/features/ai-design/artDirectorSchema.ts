import { z } from 'zod'

/**
 * DesignSlot : un emplacement image dans le design
 * (hero-visual, product, background, logo, etc.)
 */
export interface DesignSlot {
  id: string
  role: 'hero-visual' | 'logo' | 'product' | 'background' | string
  bboxMm: {
    x: number
    y: number
    w: number
    h: number
  }
  description: string
}

/**
 * DesignPlan : plan structuré produit par l'Art Director
 * (zones, typographie, palette, slots d'images)
 */
export interface DesignPlan {
  /** Concept créatif : 1 phrase résumant l'intention et l'ambiance visuelle */
  concept: string

  /** Device compositional principal : diagonal-split, asymmetric-blocks, full-bleed-hero, typographic-wall, grid-axial, center-stack, corner-anchors */
  mainDevice: string

  /** Zones visuelles distinctes du design */
  zones: Array<{
    id: string
    role: 'background' | 'title' | 'subtitle' | 'body' | 'cta' | 'accent' | 'price' | 'logo-slot' | 'image-slot'
    bboxMm: {
      x: number
      y: number
      w: number
      h: number
    }
    fill?: string
    content?: string
    fontSize?: number
  }>

  /** Hiérarchie typographique et fonts autorisés */
  typography: {
    heroFont: string
    bodyFont: string
    hierarchy: Array<{
      role: string
      size: number
      weight: number
      color: string
    }>
  }

  /** Palette de couleurs hex imposée (#RRGGBB) */
  palette: string[]

  /** Emplacements images à générer ou remplir (product, hero, logo, etc.) */
  slots: DesignSlot[]
}

// ─── Zod Schemas (validation + JSON Schema generation) ───

const designSlotSchema = z.object({
  id: z.string(),
  role: z.string(),
  bboxMm: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  description: z.string(),
})

const designZoneSchema = z.object({
  id: z.string(),
  role: z.enum(['background', 'title', 'subtitle', 'body', 'cta', 'accent', 'price', 'logo-slot', 'image-slot']),
  bboxMm: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
  fill: z.string().optional(),
  content: z.string().optional(),
  fontSize: z.number().optional(),
})

const typographySchema = z.object({
  heroFont: z.string(),
  bodyFont: z.string(),
  hierarchy: z.array(
    z.object({
      role: z.string(),
      size: z.number(),
      weight: z.number(),
      color: z.string(),
    }),
  ),
})

export const designPlanSchema = z.object({
  concept: z.string().min(10).max(500),
  mainDevice: z.string(),
  zones: z.array(designZoneSchema).min(4).max(6),
  typography: typographySchema,
  palette: z.array(z.string().regex(/^#[0-9A-Fa-f]{6}$/)).min(1).max(8),
  slots: z.array(designSlotSchema).min(0).max(8),
}) satisfies z.ZodSchema<DesignPlan>

// JSON Schema pour le LLM (Gemini responseSchema / Claude input_schema)
export const designPlanJsonSchema = {
  type: 'object',
  properties: {
    concept: {
      type: 'string',
      description: 'Concept créatif en 1-2 phrases : intention, ambiance, style du design',
    },
    mainDevice: {
      type: 'string',
      description: 'Device compositional : diagonal-split | asymmetric-blocks | full-bleed-hero | typographic-wall | grid-axial | center-stack | corner-anchors',
    },
    zones: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: {
            type: 'string',
            enum: ['background', 'title', 'subtitle', 'body', 'cta', 'accent', 'price', 'logo-slot', 'image-slot'],
          },
          bboxMm: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
            required: ['x', 'y', 'w', 'h'],
          },
          fill: { type: 'string', description: 'Couleur hex #RRGGBB ou null' },
          content: { type: 'string', description: 'Contenu texte si applicable' },
          fontSize: { type: 'number', description: 'Taille police en points si applicable' },
        },
        required: ['id', 'role', 'bboxMm'],
      },
      description: 'EXACTEMENT 4-6 zones disjointes (background + 1-2 images + 2-4 textes)',
    },
    typography: {
      type: 'object',
      properties: {
        heroFont: { type: 'string', description: 'Font family pour les titres (MUST be in availableFonts list)' },
        bodyFont: { type: 'string', description: 'Font family pour le body (MUST be in availableFonts list)' },
        hierarchy: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              size: { type: 'number', description: 'Taille en pt' },
              weight: { type: 'number' },
              color: { type: 'string', description: 'Hex #RRGGBB' },
            },
          },
        },
      },
      required: ['heroFont', 'bodyFont'],
    },
    palette: {
      type: 'array',
      items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      description: '3-5 couleurs hex #RRGGBB',
    },
    slots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string' },
          bboxMm: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
            required: ['x', 'y', 'w', 'h'],
          },
          description: { type: 'string', description: '1 phrase pour Nano Banana' },
        },
        required: ['id', 'role', 'bboxMm', 'description'],
      },
    },
  },
  required: ['concept', 'mainDevice', 'zones', 'typography', 'palette', 'slots'],
} as Record<string, unknown>
