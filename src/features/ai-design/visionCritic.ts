/**
 * Vision Critic — compare le rendu SVG courant à la référence Nano Banana,
 * et produit un patch structuré (ops upsert/remove) applicable au DesignPlan.
 *
 * Appelle Claude Opus 4.7 en multimodal avec 2 images (ref + render) + le
 * plan JSON courant. Retourne un ensemble d'opérations à fort confidence.
 *
 * Invariant : le critic NE réécrit PAS le plan entier. Il produit uniquement
 * des deltas. Ça rend la boucle convergente et interprétable.
 */

import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import type { DesignPlan } from './artDirectorSchema'

// ─── Schema du patch ──────────────────────────────────────────────────

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
})

const upsertZoneSchema = z.object({
  op: z.literal('upsert-zone'),
  id: z.string(),
  role: z
    .enum(['background', 'title', 'subtitle', 'body', 'cta', 'accent', 'price', 'logo-slot', 'image-slot'])
    .optional(),
  bboxMm: bboxSchema.optional(),
  fill: z.string().optional(),
  content: z.string().optional(),
  fontSize: z.number().optional(),
  textColor: z.string().optional(),
  decoration: z.enum(['none', 'underline', 'line-through']).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  reason: z.string(),
})

const removeZoneSchema = z.object({
  op: z.literal('remove-zone'),
  id: z.string(),
  reason: z.string(),
})

const upsertSlotSchema = z.object({
  op: z.literal('upsert-slot'),
  id: z.string(),
  role: z.string().optional(),
  bboxMm: bboxSchema.optional(),
  description: z.string().optional(),
  assetIndex: z.number().int().min(0).optional(),
  reason: z.string(),
})

const removeSlotSchema = z.object({
  op: z.literal('remove-slot'),
  id: z.string(),
  reason: z.string(),
})

export const criticPatchSchema = z.object({
  fidelityScore: z.number().min(0).max(100),
  verdict: z.enum(['pass', 'retry', 'fail']),
  summary: z.string(),
  ops: z.array(
    z.discriminatedUnion('op', [upsertZoneSchema, removeZoneSchema, upsertSlotSchema, removeSlotSchema]),
  ),
})

export type CriticPatch = z.infer<typeof criticPatchSchema>
export type CriticOp = CriticPatch['ops'][number]

// JSON Schema strict pour l'API Anthropic (pas de Record<string, unknown> cast)
const criticPatchJsonSchema = {
  type: 'object' as const,
  properties: {
    fidelityScore: {
      type: 'number' as const,
      minimum: 0,
      maximum: 100,
      description: 'Score de fidélité 0-100 après examen visuel comparatif',
    },
    verdict: {
      type: 'string' as const,
      enum: ['pass', 'retry', 'fail'] as const,
      description: 'pass = ≥85, retry = 60-84 (on applique les ops et on reloope), fail = <60',
    },
    summary: { type: 'string' as const, description: 'Résumé en 1-2 phrases des écarts observés' },
    ops: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          op: {
            type: 'string' as const,
            enum: ['upsert-zone', 'remove-zone', 'upsert-slot', 'remove-slot'] as const,
          },
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
          fill: { type: 'string' as const },
          content: { type: 'string' as const },
          fontSize: { type: 'number' as const },
          textColor: { type: 'string' as const },
          decoration: { type: 'string' as const, enum: ['none', 'underline', 'line-through'] as const },
          align: { type: 'string' as const, enum: ['left', 'center', 'right'] as const },
          description: { type: 'string' as const },
          assetIndex: { type: 'number' as const },
          reason: { type: 'string' as const, description: "Pourquoi cette correction (1 phrase)" },
        },
        required: ['op', 'id', 'reason'] as const,
      },
    },
  },
  required: ['fidelityScore', 'verdict', 'summary', 'ops'] as const,
}

// ─── Prompt ──────────────────────────────────────────────────────────

function buildCriticPrompt(plan: DesignPlan, widthMm: number, heightMm: number): string {
  return `Tu es un **Vision Critic de design print**. Deux images te sont fournies en multimodal :

1. **Image 1 = RÉFÉRENCE Nano Banana** : le design cible, tel qu'il DEVRAIT apparaître.
2. **Image 2 = RENDU SVG courant** : ce que la pipeline a produit à partir du DesignPlan ci-dessous.

Ta mission : compare visuellement les deux, identifie les écarts, et émets un PATCH structuré applicable au DesignPlan pour rapprocher le rendu de la référence.

## Contexte dimensionnel
- Format : ${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm
- Les deux images ont le MÊME ratio. Les bboxMm sont exprimés en mm absolus (origine top-left = (0,0), bas-right = (${widthMm.toFixed(1)}, ${heightMm.toFixed(1)})).

## DesignPlan courant (JSON, zones + slots)
\`\`\`json
${JSON.stringify(plan, null, 2)}
\`\`\`

## Types d'écarts à chercher en priorité

1. **Texte manquant** : un texte visible dans la référence mais absent du rendu → \`upsert-zone\` avec \`content\`, \`role\`, \`bboxMm\`, \`fontSize\`, \`textColor\`. Même pour les badges type "LITHIUM-ION" / "LXT" / "18v" : utilise \`role="accent"\` avec \`fill\` **ET** \`content\` (pas seulement \`fill\` — sinon il ne reste qu'un rectangle muet).
2. **Décorum manquant** : bande de couleur, ribbon, pipe \`|\`, accent décoratif PUR → \`upsert-zone\` avec \`role=accent|background\` + \`fill\`. Pour un CTA ou un badge prix, AJOUTE TOUJOURS \`content\` avec le texte exact : un \`cta\`/\`price\`/\`badge accent\` sans \`content\` apparaît comme un rectangle vide.
3. **Container mal dimensionné** : texte qui déborde → **élargis en priorité \`bboxMm\`** (en hauteur et/ou largeur, +20-40 %) plutôt que shrinker \`fontSize\`. Un texte de 2-4 pt est illisible et vaut autant qu'un texte manquant. **Planchers lisibles absolus** (ne descends JAMAIS en-dessous, même en cas de conflit) : body ≥ 5 pt, subtitle ≥ 7 pt, title ≥ 10 pt, price ≥ 7 pt, cta ≥ 6 pt, accent ≥ 3 pt. Si ton rendu semble trop vide parce qu'un bloc manque, c'est presque toujours qu'il est sous le seuil de rendu — élargis la bbox, ne réduis pas la police.
4. **Position incorrecte** : bloc visiblement déplacé → \`upsert-zone\` avec nouveau \`bboxMm\`.
5. **Contenu texte erroné** : texte présent mais différent de la ref → \`upsert-zone\` avec \`content\` corrigé (capitalisation, accents, nombre de lignes via \`\\n\`).
6. **Paragraphes à grouper** : plusieurs zones qui devraient être UNE SEULE (ex: 6 bullets en 6 zones → 1 zone body avec \`\\n\`) → \`remove-zone\` sur les N-1 premières + \`upsert-zone\` sur la survivante avec le \`content\` fusionné et \`bboxMm\` englobant.
7. **Zones fantômes** : éléments présents dans le rendu mais absents de la référence → \`remove-zone\`.

## Règles IMPÉRATIVES pour les ops

- Chaque op DOIT être indépendante et applicable seule.
- \`id\` : pour \`upsert-zone\`, réutilise un id existant si tu modifies, invente un id unique (\`critic-xxx\`) si tu crées.
- \`bboxMm\` : STRICTEMENT dans \`[0, ${widthMm.toFixed(1)}] × [0, ${heightMm.toFixed(1)}]\`. Respecte la zone de sécurité 5 mm pour les textes.
- \`content\` : texte EXACT tel qu'il apparaît dans la ref. Si multi-lignes, \`\\n\`.
- \`fontSize\` : en pt. Pour un titre sur une bannière de 100 mm de haut, vise 30-50 pt.
- \`reason\` : une phrase concrète ("le titre déborde à droite dans le rendu" / "manque un pipe jaune entre GAMME et PROFESSIONAL SERIES").

## Verdict

- **pass** (score ≥ 85) : aucune correction substantielle nécessaire. \`ops\` peut rester vide.
- **retry** (60-84) : des écarts réparables — émets les ops précises.
- **fail** (< 60) : rendu mauvais. **CELA NE TE DISPENSE PAS D'ÉMETTRE DES OPS.** Au contraire : plus le rendu est mauvais, plus tu dois émettre d'ops pour le réparer. Un verdict \`fail\` avec \`ops=[]\` est INACCEPTABLE — c'est que tu n'as pas essayé.

## Règle d'or

**CHAQUE écart observé dans \`summary\` DOIT correspondre à au moins une op concrète dans \`ops\`.** Si tu écris "le logo est illisible", tu DOIS émettre une \`upsert-zone\` ou \`upsert-slot\` pour le corriger. Si tu écris "le CTA chevauche les specs", tu DOIS émettre une \`upsert-zone\` qui déplace l'un des deux. Si tu écris "la bande turquoise est mal positionnée", tu DOIS émettre une \`upsert-zone\` avec un nouveau \`bboxMm\`.

Un bon critic = 5 à 15 ops pour un rendu imparfait, pas une liste vide + un paragraphe descriptif.

## Sortie

Retourne UNIQUEMENT le JSON conforme à \`emit_response\`. Pas de narration hors du schema.`
}

// ─── Entry point ─────────────────────────────────────────────────────

export interface RunVisionCriticArgs {
  plan: DesignPlan
  widthMm: number
  heightMm: number
  /** Data URI de la ref Nano Banana (data:image/png;base64,...) */
  referenceImage: string
  /** Data URI du rendu SVG rasterisé (data:image/png;base64,...) */
  renderedImage: string
}

export async function runVisionCritic(args: RunVisionCriticArgs): Promise<CriticPatch> {
  const { plan, widthMm, heightMm, referenceImage, renderedImage } = args
  const prompt = buildCriticPrompt(plan, widthMm, heightMm)

  return generateJson<CriticPatch>({
    task: 'design.critic.vision',
    prompt,
    schema: criticPatchSchema,
    schemaForLLM: criticPatchJsonSchema,
    schemaForClaude: criticPatchJsonSchema,
    version: 'design.critic.vision.v1',
    imageDataUris: [referenceImage, renderedImage],
  })
}
