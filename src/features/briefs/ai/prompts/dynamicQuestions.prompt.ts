import { z } from 'zod'
import type { TaxonomyNode } from '@/features/taxonomy/types'

export const VERSION = 'dynamic-questions-2026-04-07-1'

const QuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'multiselect', 'boolean']),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  helpText: z.string().optional(),
})

export const DynamicQuestionsResponseSchema = z.object({
  selectedNodeIds: z.array(z.string()).min(1),
  questions: z.array(QuestionSchema).min(2).max(10),
  reasoning: z.string(),
})

/** Schéma JSON-Schema pour Gemini `responseSchema`. */
export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    selectedNodeIds: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          type: {
            type: 'string',
            enum: ['text', 'number', 'select', 'multiselect', 'boolean'],
          },
          options: { type: 'array', items: { type: 'string' } },
          required: { type: 'boolean' },
          helpText: { type: 'string' },
        },
        required: ['id', 'label', 'type', 'required'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['selectedNodeIds', 'questions', 'reasoning'],
}

interface BuildOpts {
  clientValues: Record<string, unknown>
  nodes: Pick<TaxonomyNode, 'id' | 'label' | 'parentId' | 'level'>[]
}

export function buildPrompt({ clientValues, nodes }: BuildOpts): string {
  const nodesSummary = nodes
    .map((n) => `- ${n.id} (level ${n.level}, parent ${n.parentId ?? 'root'}): ${n.label}`)
    .join('\n')

  return `Tu es un expert en signalétique et PLV. Sur la base d'un brief client et d'une taxonomie de produits, tu dois :
1) Identifier les nœuds de taxonomie pertinents pour ce client (entre 1 et 6 ids).
2) Générer 4 à 8 questions complémentaires courtes pour préciser le besoin avant de choisir des produits. Évite les questions déjà couvertes par le brief.
3) Justifier ton raisonnement en 2-3 phrases.

Brief client :
${JSON.stringify(clientValues, null, 2)}

Taxonomie disponible :
${nodesSummary}

Contraintes :
- Les ids dans selectedNodeIds DOIVENT exister dans la liste ci-dessus.
- Les questions doivent être en français, claires, et avoir un type adapté (text, number, select, multiselect, boolean).
- Pour select / multiselect, fournis 2 à 6 options.
- Le champ id de chaque question doit être un slug court unique (ex: "q-format", "q-emplacement").

Réponds en JSON strict conforme au schéma demandé.`
}
