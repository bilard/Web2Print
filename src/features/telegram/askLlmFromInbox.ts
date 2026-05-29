// src/features/telegram/askLlmFromInbox.ts
//
// Appel LLM « libre » depuis la boîte Telegram : un message texte nu (sans commande
// /flow /run /clear) est transmis au LLM ACTIVÉ et sa réponse est renvoyée sur Telegram.
//
// Pipeline récupération-puis-réponse (pas de function-calling : le routeur generateJson
// est mono-coup et certains providers de la cascade, ex. DeepSeek, n'ont pas de tools) :
//   1. PLAN  — le LLM décide s'il faut une recherche web et répond directement sinon.
//   2. FETCH — récupération déterministe via Jina (URLs du message + recherche web).
//   3. ANSWER— réponse contextualisée avec le contenu web injecté.
// Dégrade gracieusement : si Jina ne renvoie rien, on répond avec les connaissances du
// modèle plutôt que d'échouer.
//
// Réutilise tout le routeur existant (`generateJson`) : cascade de providers, cooldown,
// clés API et modèle sélectionné par provider. Le modèle qui répond réellement est
// capturé via `onProviderUsed` pour pouvoir l'afficher dans la réponse.

import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { extractUrls, gatherWebContext } from './webContext'

// ── Schéma du PLAN : décision (chercher ou non) + réponse directe éventuelle ──
const PlanSchema = z.object({
  needsWeb: z.boolean(),
  searchQuery: z.string(),
  answer: z.string(),
})

const PLAN_SCHEMA_FOR_LLM = {
  type: 'object',
  properties: {
    needsWeb: {
      type: 'boolean',
      description:
        "true si répondre correctement nécessite une information du web (temps réel, " +
        "actualités, score sportif, météo, prix, données factuelles récentes, contenu d'une URL).",
    },
    searchQuery: {
      type: 'string',
      description: 'Requête de recherche web optimisée (mots-clés) si needsWeb=true, sinon chaîne vide.',
    },
    answer: {
      type: 'string',
      description: 'Réponse directe au message si needsWeb=false ; chaîne vide si needsWeb=true.',
    },
  },
  required: ['needsWeb', 'searchQuery', 'answer'],
} as const

// ── Schéma de la RÉPONSE finale ──
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
  /** Modèle exact ayant produit la réponse renvoyée à l'utilisateur. */
  model: string
  /** URLs utilisées comme sources (vide si réponse sans recherche). */
  sources: string[]
}

export interface AskLlmOptions {
  /** Callback de progression (logué côté worker Telegram). */
  onStep?: (message: string) => void
}

const ASSISTANT_INTRO =
  "Tu es l'assistant de l'application Web2Print, joignable via un bot Telegram. "

/**
 * Interroge le LLM activé avec un message Telegram libre, avec accès web (recherche +
 * lecture d'URL) quand c'est nécessaire.
 * @throws si tous les providers de la cascade échouent (clé absente, quota, réseau).
 */
export async function askLlm(question: string, options: AskLlmOptions = {}): Promise<AskLlmResult> {
  const { onStep } = options
  let provider = ''
  let model = ''
  const capture = (info: { provider: string; model: string }): void => {
    provider = info.provider
    model = info.model
  }

  // ── 1. PLAN : chercher ou répondre directement ──
  const plan = await generateJson<{ needsWeb: boolean; searchQuery: string; answer: string }>({
    task: 'telegram.chatPlan',
    version: 'telegram.chatPlan.v1',
    prompt:
      ASSISTANT_INTRO +
      'Analyse le message ci-dessous.\n' +
      "- Si tu peux y répondre correctement avec tes connaissances (conversation, aide sur l'app, " +
      'explications, code…), mets needsWeb=false et écris ta réponse complète dans "answer" ' +
      '(concise, dans la langue du message).\n' +
      '- Si une réponse correcte nécessite une information du web (temps réel, actualités, score ' +
      "sportif, météo, prix, données factuelles récentes, contenu d'une URL), mets needsWeb=true, " +
      'écris une requête de recherche optimisée dans "searchQuery", et laisse "answer" vide.\n\n' +
      `Message : ${question}`,
    schema: PlanSchema,
    schemaForLLM: PLAN_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    onProviderUsed: capture,
  })

  // ── 2. FETCH : URLs du message (option B) + recherche web (option A) ──
  const urls = extractUrls(question)
  const wantsSearch = plan.needsWeb && plan.searchQuery.trim().length > 0
  const needsContext = urls.length > 0 || wantsSearch

  if (!needsContext) {
    return { answer: plan.answer, provider, model, sources: [] }
  }

  if (urls.length > 0) onStep?.(`🔗 Lecture de ${urls.length} lien(s)…`)
  if (wantsSearch) onStep?.(`🔎 Recherche web : « ${plan.searchQuery.trim()} »…`)

  const ctx = await gatherWebContext({
    urls,
    searchQuery: wantsSearch ? plan.searchQuery : '',
  })

  // ── 3a. Rien récupéré → dégradation gracieuse ──
  if (!ctx.text) {
    onStep?.('Aucun contenu web récupéré — réponse sans recherche.')
    if (plan.answer.trim()) {
      return { answer: plan.answer, provider, model, sources: [] }
    }
    // Le plan n'avait pas de réponse directe (needsWeb=true) → on demande quand même.
    const fallback = await generateJson<{ answer: string }>({
      task: 'telegram.chat',
      version: 'telegram.chat.v1',
      prompt:
        ASSISTANT_INTRO +
        "La recherche web n'a renvoyé aucun résultat exploitable. Réponds au mieux avec tes " +
        'connaissances, dans la langue du message, et précise honnêtement si l\'information ' +
        "demandée nécessite une source à jour que tu n'as pas pu consulter.\n\n" +
        `Message : ${question}`,
      schema: AnswerSchema,
      schemaForLLM: ANSWER_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
      onProviderUsed: capture,
    })
    return { answer: fallback.answer, provider, model, sources: [] }
  }

  // ── 3b. Réponse contextualisée avec le contenu web ──
  onStep?.('🤖 Synthèse de la réponse…')
  const final = await generateJson<{ answer: string }>({
    task: 'telegram.chat',
    version: 'telegram.chat.v1',
    prompt:
      ASSISTANT_INTRO +
      "Réponds au message de l'utilisateur en t'appuyant sur le CONTEXTE WEB ci-dessous " +
      '(résultats de recherche et/ou contenu de pages). Sois concis et factuel, dans la langue ' +
      'du message. Si le contexte ne contient pas l\'information, dis-le honnêtement.\n\n' +
      `## CONTEXTE WEB\n${ctx.text}\n\n## MESSAGE\n${question}`,
    schema: AnswerSchema,
    schemaForLLM: ANSWER_SCHEMA_FOR_LLM as unknown as Record<string, unknown>,
    onProviderUsed: capture,
  })

  return { answer: final.answer, provider, model, sources: ctx.sources }
}
