/**
 * Vectorisation d'une image Nano Banana via Claude Opus multimodal.
 *
 * CRUCIAL : on ne demande PAS à Claude de "lire" le texte (OCR free-form → hallucinations).
 * On lui fournit le texte exact du plan Art Director et on lui demande UNIQUEMENT
 * de localiser chaque bloc de texte dans l'image + d'identifier les formes et zones image.
 *
 * Sortie : VectorPlan avec positions précises, styles détectés. Le contenu textuel
 * reste fidèle au plan.
 */

import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import type { DesignPlan } from './artDirectorSchema'

export const textMatchSchema = z.object({
  zoneId: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  fontSizePt: z.number(),
  fontFamily: z.string().optional(),
  fontWeight: z.number().optional(),
  color: z.string(),
  align: z.enum(['left', 'center', 'right']).optional(),
  decoration: z.enum(['none', 'underline', 'line-through']).optional(),
  backgroundColor: z.string().optional(),
})

export const shapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    fill: z.string(),
  }),
  z.object({
    type: z.literal('polygon'),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    fill: z.string(),
  }),
])

export const imageRegionSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  description: z.string().optional(),
})

export const vectorMatchPlanSchema = z.object({
  texts: z.array(textMatchSchema),
  shapes: z.array(shapeSchema),
  imageRegions: z.array(imageRegionSchema),
})

export type VectorMatchPlan = z.infer<typeof vectorMatchPlanSchema>

const vectorMatchPlanJsonSchema = {
  type: 'object' as const,
  properties: {
    texts: {
      type: 'array' as const,
      description: 'Un objet par zone texte du plan — MÊME nombre d\'éléments, MÊMES zoneId',
      items: {
        type: 'object' as const,
        properties: {
          zoneId: { type: 'string' as const, description: 'ID exact de la zone du plan Art Director' },
          x: { type: 'number' as const, description: 'Position X du bloc texte en mm' },
          y: { type: 'number' as const, description: 'Position Y en mm' },
          w: { type: 'number' as const, description: 'Largeur du bloc en mm' },
          h: { type: 'number' as const, description: 'Hauteur du bloc en mm' },
          fontSizePt: { type: 'number' as const, description: 'Taille de police observée en points (pt)' },
          fontFamily: { type: 'string' as const, description: 'Famille de police la plus proche : Oswald, Inter, Roboto, Montserrat, Bebas Neue, Anton, Open Sans' },
          fontWeight: { type: 'number' as const, description: '400, 600, 700, 900' },
          color: { type: 'string' as const, description: 'Couleur du texte en hex #RRGGBB (observée dans l\'image)' },
          align: { type: 'string' as const, enum: ['left', 'center', 'right'] as const },
          decoration: { type: 'string' as const, enum: ['none', 'underline', 'line-through'] as const, description: 'line-through pour prix barrés' },
          backgroundColor: { type: 'string' as const, description: 'Couleur de fond immédiate derrière le texte en hex #RRGGBB (pour masquer le texte raster si besoin)' },
        },
        required: ['zoneId', 'x', 'y', 'w', 'h', 'fontSizePt', 'color'] as const,
      },
    },
    shapes: {
      type: 'array' as const,
      description: 'Formes géométriques (blocs couleur, diagonales) que l\'utilisateur peut vouloir éditer',
      items: {
        type: 'object' as const,
        properties: {
          type: { type: 'string' as const, enum: ['rect', 'polygon'] as const },
          x: { type: 'number' as const },
          y: { type: 'number' as const },
          w: { type: 'number' as const },
          h: { type: 'number' as const },
          points: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                x: { type: 'number' as const },
                y: { type: 'number' as const },
              },
              required: ['x', 'y'] as const,
            },
          },
          fill: { type: 'string' as const, description: 'Couleur hex #RRGGBB' },
        },
        required: ['type', 'fill'] as const,
      },
    },
    imageRegions: {
      type: 'array' as const,
      description: 'Zones image éditables (photo produit, logos)',
      items: {
        type: 'object' as const,
        properties: {
          id: { type: 'string' as const, description: 'ID logique (ex: hero-product, logo)' },
          x: { type: 'number' as const },
          y: { type: 'number' as const },
          w: { type: 'number' as const },
          h: { type: 'number' as const },
          description: { type: 'string' as const },
        },
        required: ['id', 'x', 'y', 'w', 'h'] as const,
      },
    },
  },
  required: ['texts', 'shapes', 'imageRegions'] as const,
}

interface VectorizeArgs {
  imageDataUri: string
  plan: DesignPlan
  widthMm: number
  heightMm: number
}

export async function vectorizeImage(args: VectorizeArgs): Promise<VectorMatchPlan> {
  const planTextZones = args.plan.zones.filter(
    (z) => ['title', 'subtitle', 'body', 'cta', 'price'].includes(z.role) && z.content,
  )

  const prompt = `Tu regardes une image créative (bannière/affiche retail) et tu PLACES des éléments éditables par-dessus. L'image fait ${args.widthMm} × ${args.heightMm} mm.

# Ce que tu DOIS faire (tâche 1 : localiser les textes)

Le designer a prévu ces zones texte avec leur contenu EXACT :

${planTextZones
  .map(
    (z) =>
      `- zoneId="${z.id}" | rôle=${z.role} | contenu="${z.content}" (bbox prévue ${z.bboxMm.x},${z.bboxMm.y},${z.bboxMm.w}×${z.bboxMm.h}mm, taille prévue ${z.fontSize ?? '?'}pt)`,
  )
  .join('\n')}

Pour CHAQUE zoneId ci-dessus, observe l'image et retourne un objet dans \`texts\` contenant :
- zoneId : même identifiant (obligatoire)
- x, y, w, h : bbox RÉELLE observée dans l'image en mm (peut différer du plan)
- fontSizePt : taille de police observée
- fontFamily : la police disponible la plus proche (Oswald/Inter/Roboto/Montserrat/Bebas Neue/Anton/Open Sans)
- fontWeight : 400, 600, 700, 900
- color : couleur du texte en hex observée
- align : left/center/right
- decoration : line-through si le texte est barré (prix barré), sinon none
- backgroundColor : couleur solide immédiatement DERRIÈRE le texte (sert à masquer le raster pour laisser la place au texte vectoriel)

**RÈGLE CRITIQUE** : tu ne changes JAMAIS le contenu du texte. On n'a pas besoin que tu le recopies. Localise et décris le style, c'est tout.

Si une zone du plan ne trouve AUCUNE correspondance visible dans l'image, omets-la (pas d'objet dans texts pour elle).

# Tâche 2 : identifier les formes graphiques

Dans \`shapes\`, liste les rectangles pleins et polygones (diagonales, splits) qui composent l'image. Pour chacun : type, coordonnées mm, couleur hex. Ces formes seront éditables.

# Tâche 3 : identifier les zones image

Dans \`imageRegions\`, liste chaque zone qui contient une PHOTO/image raster (photo produit, logo visuel). Pour chacune : id, x, y, w, h en mm. La bbox doit être SERRÉE autour du contenu visible (crop bien le produit).

# Sortie

Réponds via l'outil emit_response avec \`{ texts, shapes, imageRegions }\`.
`

  const plan = await generateJson<VectorMatchPlan>({
    task: 'design.vectorize',
    prompt,
    schema: vectorMatchPlanSchema,
    schemaForLLM: vectorMatchPlanJsonSchema,
    schemaForClaude: vectorMatchPlanJsonSchema,
    version: 'design.vectorize.v2',
    imageDataUris: [args.imageDataUri],
  })

  return plan
}
