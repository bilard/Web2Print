/**
 * LLM Router — point d'entrée unique pour toutes les générations JSON structurées.
 *
 * Stratégie : Claude Opus 4.7 au centre du raisonnement, Gemini en fallback (et
 * pour les tâches rapides où la latence prime). Nano Banana reste géré séparément
 * dans `geminiImageClient.ts` pour la génération d'images.
 *
 * Routage par tâche dans TASK_ROUTING ci-dessous. Chaque appel essaie le provider
 * primaire, et bascule sur le secondaire en cas d'erreur réseau / quota / clé absente.
 */

import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'
import { generateJson as geminiGenerateJson } from '@/features/briefs/ai/geminiClient'

export type LLMProviderId = 'claude' | 'gemini' | 'openai'

/**
 * Snapshot du payload réellement envoyé au provider LLM.
 * Exposé via `onRequestSent` pour permettre un affichage debug dans l'UI
 * (prompt + paramètres tels qu'ils sont envoyés à l'API).
 */
export interface LlmRequestInfo {
  provider: LLMProviderId
  endpoint: string
  model: string
  temperature: number
  max_tokens: number
  /** Messages envoyés au modèle (rôle + contenu texte concaténé). */
  messages: Array<{ role: string; content: string }>
  /** Nom de l'outil (Claude tool-use). */
  tool_name?: string
  /** Schéma d'input de l'outil — ce que le modèle doit remplir. */
  input_schema?: Record<string, unknown>
  /** Nom de la tâche (LLMTask) — pour la traçabilité. */
  task: string
  /** Version du prompt (pour la traçabilité). */
  version: string
}

type LLMTask =
  | 'brief.dynamicQuestions'
  | 'brief.cartGeneration'
  | 'brief.deckStructure'
  | 'brief.imagePrompts'
  | 'brief.catalogKeywords'
  | 'product.enrichment'
  | 'design.generate'
  | 'design.plan'
  | 'design.emit'

interface RouteConfig {
  primary: LLMProviderId
  fallback?: LLMProviderId
  /** Modèle override (sinon défaut du provider) */
  model?: string
}

/**
 * Table de routage : chaque tâche cible un provider primaire et un fallback.
 * Les tâches de raisonnement structuré vont sur Claude Opus 4.7 ; les tâches
 * rapides ou massives sur Gemini Flash.
 */
const TASK_ROUTING: Record<LLMTask, RouteConfig> = {
  'brief.dynamicQuestions': { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  'brief.cartGeneration':   { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  'brief.deckStructure':    { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  'brief.imagePrompts':     { primary: 'gemini', fallback: 'claude' },
  'brief.catalogKeywords':  { primary: 'gemini', fallback: 'claude' },
  'product.enrichment':     { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  'design.generate':        { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  // Art Director / SVG Engineer : Sonnet 4.6 suffit largement pour du JSON
  // structuré et est 3–5× plus rapide qu'Opus (gain ~10–20 s par run).
  'design.plan':            { primary: 'claude', fallback: 'gemini', model: 'claude-sonnet-4-6' },
  'design.emit':            { primary: 'claude', fallback: 'gemini', model: 'claude-sonnet-4-6' },
}

// Extraction = déterministe (temperature 0). Autres tâches créatives = 0.4.
const TASK_TEMPERATURE: Record<LLMTask, number> = {
  'brief.dynamicQuestions': 0.4,
  'brief.cartGeneration':   0.4,
  'brief.deckStructure':    0.4,
  'brief.imagePrompts':     0.4,
  'brief.catalogKeywords':  0.4,
  'product.enrichment':     0,
  'design.generate':        0.6,
  'design.plan':            0.75,
  'design.emit':            0.2,
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
  /** Callback invoqué avec le provider réellement utilisé (primaire OU fallback)
   *  et le modèle exact. Utile pour afficher la provenance dans l'UI. */
  onProviderUsed?: (info: { provider: LLMProviderId; model: string }) => void
  /** Callback invoqué juste avant l'envoi du payload au provider, avec un snapshot
   *  des paramètres effectifs (modèle, temperature, prompt, tool schema…).
   *  Permet à l'UI d'afficher le prompt et les paramètres exacts en mode debug. */
  onRequestSent?: (info: LlmRequestInfo) => void
  /** Images base64 à inclure dans le prompt (vision multimodal, pour Claude).
   *  Format : data URIs (data:image/png;base64,<base64-string>) */
  imageDataUris?: string[]
}

/**
 * Point d'entrée unique. Essaie le provider primaire, fallback en cas d'échec.
 * Throws seulement si TOUS les providers configurés échouent.
 */
const DEFAULT_MODEL: Record<LLMProviderId, string> = {
  claude: 'claude-opus-4-7',
  gemini: 'gemini-3.1-pro-preview',
  openai: 'gpt-4o',
}

export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const route = TASK_ROUTING[opts.task]
  const primary = opts.forceProvider ?? route.primary
  const fallback = opts.forceProvider ? undefined : route.fallback

  try {
    const result = await callProvider(primary, opts, route.model)
    opts.onProviderUsed?.({ provider: primary, model: route.model ?? DEFAULT_MODEL[primary] })
    return result
  } catch (err) {
    if (!fallback) throw err
    console.warn(
      `[llmRouter] ${opts.task}: provider primaire "${primary}" a échoué, fallback sur "${fallback}". Cause:`,
      err,
    )
    const result = await callProvider(fallback, opts)
    opts.onProviderUsed?.({ provider: fallback, model: DEFAULT_MODEL[fallback] })
    return result
  }
}

async function callProvider<T>(
  provider: LLMProviderId,
  opts: GenerateJsonOptions<T>,
  modelOverride?: string,
): Promise<T> {
  if (provider === 'claude') {
    return await callClaude(opts, modelOverride ?? 'claude-opus-4-7')
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
  //
  // `cache_control: ephemeral` sur le tool permet à l'API de mettre le schéma
  // en cache 5 min. Sur les runs répétés (re-génération de design), la phase
  // Art Director / SVG Engineer économise ~30–50% du prompt-processing time.
  const toolName = 'emit_response'
  const tool = {
    name: toolName,
    description: 'Émet la réponse structurée conforme au schéma demandé.',
    input_schema: opts.schemaForClaude ?? opts.schemaForLLM,
    cache_control: { type: 'ephemeral' as const },
  }

  const temperature = TASK_TEMPERATURE[opts.task]
  // Les tâches design sont plus bavardes mais 16k est souvent excessif — on
  // garde 16k pour design.emit (SVG complet) et on abaisse pour les plans JSON.
  const max_tokens =
    opts.task === 'design.emit' || opts.task === 'design.generate'
      ? 16384
      : opts.task === 'design.plan'
        ? 8192
        : 8192

  // Construit le content du message user : texte seul OU multimodal (images + texte)
  type MessageContent = string | Array<{ type: string; [key: string]: unknown }>
  const buildMessageContent = (): MessageContent => {
    if (!opts.imageDataUris || opts.imageDataUris.length === 0) {
      return opts.prompt
    }
    const content: Array<{ type: string; [key: string]: unknown }> = []
    for (const dataUri of opts.imageDataUris) {
      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        const mediaType = match[1]
        const data = match[2]
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data,
          },
        })
      }
    }
    content.push({
      type: 'text',
      text: opts.prompt,
    })
    return content
  }

  const messageContent = buildMessageContent()

  // Notifie l'UI du payload exact avant l'envoi (pour affichage debug).
  opts.onRequestSent?.({
    provider: 'claude',
    endpoint: ANTHROPIC_ENDPOINT,
    model,
    temperature,
    max_tokens,
    messages: [{ role: 'user', content: typeof messageContent === 'string' ? messageContent : '[multimodal: images + text]' }],
    tool_name: toolName,
    input_schema: tool.input_schema as Record<string, unknown>,
    task: opts.task,
    version: opts.version,
  })

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
        max_tokens,
        tools: [tool],
        tool_choice: { type: 'tool', name: toolName },
        messages: [{ role: 'user', content: messageContent }],
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
  const retryErrorText = `\n\nTa précédente tentative a échoué la validation : ${errorMessage}. Renvoie un JSON strictement conforme au schéma de l'outil ${toolName}.`

  // Construire le retry content : si multimodal, ajouter texte d'erreur au dernier élément text
  type RetryMessageContent = string | Array<{ type: string; [key: string]: unknown }>
  const buildRetryMessageContent = (): RetryMessageContent => {
    if (typeof messageContent === 'string') {
      return messageContent + retryErrorText
    }
    // messageContent est un array avec images + text
    const retryContent = [...messageContent] as Array<{ type: string; [key: string]: unknown }>
    const lastTextIndex = retryContent.findIndex((c, i) => c.type === 'text' && i === retryContent.length - 1)
    if (lastTextIndex !== -1 && retryContent[lastTextIndex].type === 'text') {
      retryContent[lastTextIndex] = {
        type: 'text',
        text: (retryContent[lastTextIndex].text as string) + retryErrorText,
      }
    }
    return retryContent
  }

  const retryMessageContent = buildRetryMessageContent()

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
      max_tokens,
      tools: [tool],
      tool_choice: { type: 'tool', name: toolName },
      messages: [
        {
          role: 'user',
          content: retryMessageContent,
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
      temperature: TASK_TEMPERATURE[opts.task],
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
