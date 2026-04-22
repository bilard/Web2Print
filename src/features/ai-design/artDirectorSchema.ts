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
// Note: DO NOT use 'as Record<string, unknown>' - it breaks Anthropic API validation
export const designPlanJsonSchema = {
  type: 'object' as const,
  properties: {
    concept: {
      type: 'string' as const,
      description: 'Concept créatif en 1-2 phrases : intention, ambiance, style du design',
    },
    mainDevice: {
      type: 'string' as const,
      description: 'Device compositional : diagonal-split | asymmetric-blocks | full-bleed-hero | typographic-wall | grid-axial | center-stack | corner-anchors',
    },
    zones: {
      type: 'array' as const,
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          role: {
            type: 'string' as const,
            enum: ['background', 'title', 'subtitle', 'body', 'cta', 'accent', 'price', 'logo-slot', 'image-slot'] as const,
          },
          bboxMm: {
            type: 'object' as const,
            properties: {
              x: { type: 'number' as const },
              y: { type: 'number' as const },
              w: { type: 'number' as const },
              h: { type: 'number' as const },
            },
            required: ['x', 'y', 'w', 'h'] as const,
          },
          fill: { type: 'string' as const, description: 'Couleur hex #RRGGBB' },
          content: { type: 'string' as const, description: 'Contenu texte si applicable' },
          fontSize: { type: 'number' as const, description: 'Taille police en points si applicable' },
        },
        required: ['id', 'role', 'bboxMm'] as const,
      },
      description: 'EXACTEMENT 4-6 zones disjointes (background + 1-2 images + 2-4 textes)',
    },
    typography: {
      type: 'object' as const,
      properties: {
        heroFont: { type: 'string' as const, description: 'Font family pour les titres (MUST be in availableFonts list)' },
        bodyFont: { type: 'string' as const, description: 'Font family pour le body (MUST be in availableFonts list)' },
        hierarchy: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              role: { type: 'string' as const },
              size: { type: 'number' as const, description: 'Taille en pt' },
              weight: { type: 'number' as const },
              color: { type: 'string' as const, description: 'Hex #RRGGBB' },
            },
            required: ['role', 'size', 'weight', 'color'] as const,
          },
        },
      },
      required: ['heroFont', 'bodyFont'] as const,
    },
    palette: {
      type: 'array' as const,
      items: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
      description: '3-5 couleurs hex #RRGGBB',
    },
    slots: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const },
          role: { type: 'string' as const },
          bboxMm: {
            type: 'object' as const,
            properties: {
              x: { type: 'number' as const },
              y: { type: 'number' as const },
              w: { type: 'number' as const },
              h: { type: 'number' as const },
            },
            required: ['x', 'y', 'w', 'h'] as const,
          },
          description: { type: 'string' as const, description: '1 phrase pour Nano Banana' },
        },
        required: ['id', 'role', 'bboxMm', 'description'] as const,
      },
    },
  },
  required: ['concept', 'mainDevice', 'zones', 'typography', 'palette', 'slots'] as const,
}
