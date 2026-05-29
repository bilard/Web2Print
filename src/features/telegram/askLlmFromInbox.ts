// src/features/telegram/askLlmFromInbox.ts
//
// Appel LLM « libre » depuis la boîte Telegram : un message texte nu (sans commande
// /flow /run /clear) est transmis au LLM ACTIVÉ et sa réponse est renvoyée sur Telegram.
//
// Réutilise tout le routeur existant (`generateJson`) : cascade de providers, cooldown,
// clés API et modèle sélectionné par provider. Le modèle qui répond réellement est
// capturé via `onProviderUsed` pour pouvoir l'afficher dans la réponse.

import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'

const AnswerSchema = z.object({ answer: z.string() })

const ANSWER_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Réponse au message, concise, dans la langue du message.' },
  },
  required: ['answer'],
} as const

export interface AskLlmResult {
  answer: string
  /** Provider réellement utilisé (primaire ou fallback de la cascade). */
  provider: string
  /** Modèle exact ayant répondu. */
  model: string
}

/**
 * Interroge le LLM activé avec un message Telegram libre.
 * @throws si tous les providers de la cascade échouent (clé absente, quota, réseau).
 */
export async function askLlm(question: string): Promise<AskLlmResult> {
  let provider = ''
  let model = ''

  const result = await generateJson<{ answer: string }>({
    task: 'telegram.chat',
    version: 'telegram.chat.v1',
    prompt:
      "Tu es l'assistant de l'application Web2Print, joignable via un bot Telegram. " +
      "Réponds au message ci-dessous de façon concise et utile, dans la même langue que le message. " +
      'Renseigne uniquement le champ "answer".\n\n' +
      `Message : ${question}`,
    schema: AnswerSchema,
    schemaForLLM: ANSWER_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    onProviderUsed: (info) => {
      provider = info.provider
      model = info.model
    },
  })

  return { answer: result.answer, provider, model }
}
