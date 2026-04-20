import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

/**
 * Applique les prompts utilisateurs définis PAR CHAMP dans un template de
 * scraping. Un prompt par champ peut demander n'importe quoi : filtrer,
 * reformater (one-line + séparateur, markdown → HTML…), traduire, nettoyer.
 * On route TOUT au LLM car les heuristiques keyword ne couvrent pas les
 * demandes de reformatage (cf. bug "Fil d'ariane sur une seule ligne").
 *
 * Un SEUL appel LLM batché pour tous les champs qui ont un prompt, afin
 * d'économiser tokens + latence (1 call/produit au lieu de N).
 */

export type FieldPromptValue = string | string[]

export interface FieldPromptTarget {
  /** Nom logique du champ tel que défini dans le template (ex: "description", "Fil d'ariane"). */
  name: string
  /** Instruction utilisateur à appliquer. Ignorée si vide. */
  prompt: string
  /** Valeur brute extraite par le selector CSS. */
  value: FieldPromptValue
}

export interface FieldPromptResult {
  name: string
  value: FieldPromptValue
}

const resultSchema = z.object({
  singleFields: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).default([]),
  listFields: z.array(z.object({
    name: z.string(),
    values: z.array(z.string()),
  })).default([]),
})

const schemaForLLM: Record<string, unknown> = {
  type: 'object',
  properties: {
    singleFields: {
      type: 'array',
      description: "Résultats pour les champs de type string. Le nom DOIT être identique à celui fourni en entrée.",
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['name', 'value'],
      },
    },
    listFields: {
      type: 'array',
      description: "Résultats pour les champs de type liste. Le nom DOIT être identique à celui fourni en entrée.",
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'values'],
      },
    },
  },
  required: ['singleFields', 'listFields'],
}

export async function applyFieldPrompts(
  targets: FieldPromptTarget[],
): Promise<FieldPromptResult[]> {
  const valid = targets.filter((t) => t.prompt.trim().length > 0)
  if (valid.length === 0) return []

  const singles = valid.filter((t) => !Array.isArray(t.value))
  const lists = valid.filter((t) => Array.isArray(t.value))

  const parts: string[] = []
  parts.push(
    `Tu es un post-processeur de valeurs extraites d'une page produit via des selectors CSS.
Pour CHAQUE champ ci-dessous, applique STRICTEMENT l'instruction de l'utilisateur à la valeur brute, puis retourne la valeur transformée via l'outil emit_response.

RÈGLES IMPÉRATIVES :
- N'INVENTE JAMAIS d'information nouvelle. Contente-toi de reformater, filtrer, traduire ou nettoyer la valeur fournie.
- Conserve le TYPE : un champ de type "string" reste une string (ne le découpe PAS en liste). Un champ de type "liste" reste une liste.
- Pour un reformatage qui demande une seule ligne (ex: séparateur ">"), REMPLACE tous les sauts de ligne par le séparateur — la sortie doit être une unique ligne sans "\\n".
- Si l'instruction ne s'applique pas, renvoie la valeur d'origine INTACTE.
- Le champ "name" renvoyé DOIT être EXACTEMENT identique au nom fourni en entrée (casse, accents, espaces compris).
- Retourne TOUS les champs fournis en entrée, même si tu ne les modifies pas.`,
  )

  if (singles.length > 0) {
    parts.push(`═══ CHAMPS STRING ═══`)
    for (const t of singles) {
      parts.push(
        `▸ NOM : ${t.name}
▸ INSTRUCTION : ${t.prompt.trim()}
▸ VALEUR BRUTE :
${String(t.value)}`,
      )
    }
  }

  if (lists.length > 0) {
    parts.push(`═══ CHAMPS LISTE ═══`)
    for (const t of lists) {
      const items = (t.value as string[]).map((v, i) => `  ${i + 1}. ${v}`).join('\n')
      parts.push(
        `▸ NOM : ${t.name}
▸ INSTRUCTION : ${t.prompt.trim()}
▸ ITEMS :
${items}`,
      )
    }
  }

  const prompt = parts.join('\n\n')

  const result = await generateJson({
    task: 'product.enrichment',
    prompt,
    schema: resultSchema,
    schemaForLLM,
    version: 'template.fieldPrompts.v1',
  })

  const out: FieldPromptResult[] = []
  for (const s of result.singleFields) out.push({ name: s.name, value: s.value })
  for (const l of result.listFields) out.push({ name: l.name, value: l.values })
  return out
}
