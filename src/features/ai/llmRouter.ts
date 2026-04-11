/**
 * LLM Router — point d'entrée unique pour toutes les générations JSON structurées.
 *
 * Stratégie : Claude Opus 4.6 au centre du raisonnement, Gemini en fallback (et
 * pour les tâches rapides où la latence prime). Nano Banana reste géré séparément
 * dans `geminiImageClient.ts` pour la génération d'images.
 *
 * Routage par tâche dans TASK_ROUTING ci-dessous. Chaque appel essaie le provider
 * primaire, et bascule sur le secondaire en cas d'erreur réseau / quota / clé absente.
 */

import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson as geminiGenerateJson } from '@/features/briefs/ai/geminiClient'

type LLMProviderId = 'claude' | 'gemini' | 'openai'

type LLMTask =
  | 'brief.dynamicQuestions'
  | 'brief.cartGeneration'
  | 'brief.deckStructure'
  | 'brief.imagePrompts'
  | 'brief.catalogKeywords'

interface RouteConfig {
  primary: LLMProviderId
  fallback?: LLMProviderId
  /** Modèle override (sinon défaut du provider) */
  model?: string
}

/**
 * Table de routage : chaque tâche cible un provider primaire et un fallback.
 * Les tâches de raisonnement structuré vont sur Claude Opus 4.6 ; les tâches
 * rapides ou massives sur Gemini Flash.
 */
const TASK_ROUTING: Record<LLMTask, RouteConfig> = {
  'brief.dynamicQuestions': { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-6' },
  'brief.cartGeneration':   { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-6' },
  'brief.deckStructure':    { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-6' },
  'brief.imagePrompts':     { primary: 'gemini', fallback: 'claude' },
  'brief.catalogKeywords':  { primary: 'gemini', fallback: 'claude' },
}

interface GenerateJsonOptions<T> {
  task: LLMTask
  prompt: string
  schema: z.ZodSchema<T>
  /** JSON Schema-like (utilisé par Gemini en responseSchema, et par Claude en input_schema d'un tool si schemaForClaude absent). */
  schemaForLLM: Record<string, unknown>
  /** Schéma strict optionnel dédié à Claude (supporte oneOf/anyOf, contrairement à Gemini responseSchema). */
  schemaForClaude?: Record<string, unknown>
  /** Identifiant du prompt pour traçabilité (stocké dans brief.aiVersions). */
  version: string
  /** Override manuel du provider (debug / forçage). */
  forceProvider?: LLMProviderId
}

/**
 * Point d'entrée unique. Essaie le provider primaire, fallback en cas d'échec.
 * Throws seulement si TOUS les providers configurés échouent.
 */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const route = TASK_ROUTING[opts.task]
  const primary = opts.forceProvider ?? route.primary
  const fallback = opts.forceProvider ? undefined : route.fallback

  try {
    return await callProvider(primary, opts, route.model)
  } catch (err) {
    if (!fallback) throw err
    console.warn(
      `[llmRouter] ${opts.task}: provider primaire "${primary}" a échoué, fallback sur "${fallback}". Cause:`,
      err,
    )
    return await callProvider(fallback, opts)
  }
}

async function callProvider<T>(
  provider: LLMProviderId,
  opts: GenerateJsonOptions<T>,
  modelOverride?: string,
): Promise<T> {
  if (provider === 'claude') {
    return await callClaude(opts, modelOverride ?? 'claude-opus-4-6')
  }
  if (provider === 'gemini') {
    return await geminiGenerateJson({
      prompt: opts.prompt,
      schema: opts.schema,
      schemaForGemini: opts.schemaForLLM,
      version: opts.version,
      model: modelOverride,
    })
  }
  if (provider === 'openai') {
    return await callOpenAI(opts, modelOverride ?? 'gpt-5')
  }
  throw new Error(`Provider inconnu : ${provider}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider : Claude (Anthropic API direct browser, tool-use forcé pour JSON strict)
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicContentBlock {
  type: string
  input?: Record<string, unknown>
  text?: string
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[]
  stop_reason?: string
}

async function callClaude<T>(opts: GenerateJsonOptions<T>, model: string): Promise<T> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw new Error('Clé Anthropic absente. Configurez-la dans Réglages.')

  // Tool-use forcé : on déclare un outil dont l'input_schema EST le schéma attendu,
  // et on force Claude à l'appeler. C'est la méthode officielle pour obtenir un
  // JSON strictement conforme avec Claude.
  const toolName = 'emit_response'
  const tool = {
    name: toolName,
    description: 'Émet la réponse structurée conforme au schéma demandé.',
    input_schema: opts.schemaForClaude ?? opts.schemaForLLM,
  }

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 180_000)

  let res: Response
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        temperature: 0.4,
        tools: [tool],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: opts.prompt }],
      }),
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status} : ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as AnthropicResponse
  const toolUse = data.content?.find((b) => b.type === 'tool_use')
  if (!toolUse?.input) {
    throw new Error('Claude : pas de tool_use dans la réponse')
  }

  const validation = opts.schema.safeParse(toolUse.input)
  if (validation.success) return validation.data

  // Retry une fois avec injection d'erreur
  const errorMessage = validation.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join(' ; ')
  const retryRes = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.2,
      tools: [tool],
      tool_choice: { type: 'tool', name: toolName },
      messages: [
        {
          role: 'user',
          content:
            opts.prompt +
            `\n\nTa précédente tentative a échoué la validation : ${errorMessage}. Renvoie un JSON strictement conforme au schéma de l'outil ${toolName}.`,
        },
      ],
    }),
  })
  if (!retryRes.ok) {
    const body = await retryRes.text()
    throw new Error(`Anthropic API retry ${retryRes.status} : ${body.slice(0, 300)}`)
  }
  const retryData = (await retryRes.json()) as AnthropicResponse
  const retryTool = retryData.content?.find((b) => b.type === 'tool_use')
  if (!retryTool?.input) throw new Error('Claude retry : pas de tool_use')
  const retryValidation = opts.schema.safeParse(retryTool.input)
  if (retryValidation.success) return retryValidation.data
  throw new Error(
    `Réponse Claude non conforme après retry : ${retryValidation.error.issues
      .map((i) => i.message)
      .join(' ; ')}`,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider : OpenAI (placeholder — utilise json_schema response_format)
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenAI<T>(opts: GenerateJsonOptions<T>, model: string): Promise<T> {
  const apiKey = getApiKey('openai')
  if (!apiKey) throw new Error('Clé OpenAI absente. Configurez-la dans Réglages.')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [{ role: 'user', content: opts.prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: opts.schemaForLLM,
        },
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI API ${res.status} : ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenAI : réponse vide')
  const parsed = JSON.parse(text)
  const validation = opts.schema.safeParse(parsed)
  if (validation.success) return validation.data
  throw new Error(
    `Réponse OpenAI non conforme : ${validation.error.issues.map((i) => i.message).join(' ; ')}`,
  )
}
