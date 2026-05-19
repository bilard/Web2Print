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
import { getSelectedModel, useAiSettingsStore } from '@/stores/aiSettings.store'
import { recordAiUsage, pushAiUsageListener } from '@/features/stats/aiUsageTracking'
import { useAiActivityStore, nextAiActivityId } from '@/stores/aiActivity.store'
import type { AiProvider } from '@/lib/aiModels'

export type LLMProviderId = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'openrouter'

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
  | 'product.taxonomyClassification'
  | 'design.templateFill'

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
  'product.enrichment':     { primary: 'gemini', fallback: 'claude', model: 'gemini-3.1-pro-preview' },
  // Classification taxonomique : raisonnement structuré sur libellés, Claude Opus 4.7
  'product.taxonomyClassification': { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
  // Template Fill : copy court (≈1.5 KB JSON), Claude Opus 4.7
  'design.templateFill':    { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
}

// Extraction = déterministe (temperature 0). Autres tâches créatives = 0.4.
const TASK_TEMPERATURE: Record<LLMTask, number> = {
  'brief.dynamicQuestions': 0.4,
  'brief.cartGeneration':   0.4,
  'brief.deckStructure':    0.4,
  'brief.imagePrompts':     0.4,
  'brief.catalogKeywords':  0.4,
  'product.enrichment':     0,
  'product.taxonomyClassification': 0,
  'design.templateFill':    0.5,
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
  /** Callback invoqué chaque fois qu'un provider de la cascade échoue (avec
   *  l'erreur exacte). Permet à l'UI de tracer pourquoi le fallback a basculé
   *  — typiquement Gemini rate limit / quota → Claude payant. */
  onProviderFailed?: (info: { provider: LLMProviderId; error: Error }) => void
  /** Callback invoqué avec un message d'avertissement sur la cascade configurée
   *  (ex: provider non-implémenté ignoré). Permet à l'UI de notifier que la
   *  config user n'est pas appliquée intégralement. */
  onCascadeWarning?: (warning: string) => void
  /** Callback invoqué juste avant l'envoi du payload au provider, avec un snapshot
   *  des paramètres effectifs (modèle, temperature, prompt, tool schema…).
   *  Permet à l'UI d'afficher le prompt et les paramètres exacts en mode debug. */
  onRequestSent?: (info: LlmRequestInfo) => void
  /** Images base64 à inclure dans le prompt (vision multimodal, pour Claude).
   *  Format : data URIs (data:image/png;base64,<base64-string>) */
  imageDataUris?: string[]
}

/**
 * Point d'entrée unique. Essaie les providers dans l'ordre de la cascade (depuis le store).
 * Throws seulement si TOUS les providers configurés échouent.
 */
function defaultModelFor(provider: LLMProviderId): string {
  // LLMProviderId values are also valid AiProvider values.
  return getSelectedModel(provider as AiProvider)
}

/** Le `modelOverride` du TASK_ROUTING est lié au PRIMARY provider de la route.
 *  Quand on bascule sur un fallback (cascade), le modèle ne s'applique que si
 *  son préfixe correspond au provider courant. Sinon → defaultModel du provider.
 *
 *  Sans ce check, on passait `gemini-3-flash` à DeepSeek/Claude → 400. */
export function modelForProvider(provider: LLMProviderId, modelOverride?: string): string {
  if (modelOverride) {
    const prefixMap: Record<LLMProviderId, RegExp> = {
      claude: /^claude-/i,
      gemini: /^gemini-/i,
      deepseek: /^deepseek-/i,
      openai: /^(gpt-|o\d|chatgpt)/i,
      // OpenRouter accepte des IDs préfixés par vendor (anthropic/, openai/, google/...).
      // On laisse passer tout override qui contient un slash — sinon defaultModel.
      openrouter: /\//,
    }
    if (prefixMap[provider]?.test(modelOverride)) {
      return modelOverride
    }
  }
  return defaultModelFor(provider)
}

/** Mappe la cascade du store (ReasoningProvider[]) aux LLMProviderId supportés.
 *  Filtre les providers non implémentés et signale les ignorés via callback.
 *  N'ajoute PAS de provider par défaut : la cascade exacte de l'utilisateur
 *  fait foi. Si elle est vide ou ne contient que des providers non-supportés,
 *  retourne [] et l'appelant doit gérer (throw transparent). */
export function getProviderCascade(onWarning?: (msg: string) => void): LLMProviderId[] {
  const cascade = useAiSettingsStore.getState().reasoningCascade
  const supported: LLMProviderId[] = []
  const ignored: string[] = []
  for (const p of cascade) {
    if (p === 'gemini' || p === 'claude' || p === 'openai' || p === 'deepseek' || p === 'openrouter') {
      supported.push(p)
    } else {
      // qwen, kimi, autres : non câblés dans callProvider
      ignored.push(p)
    }
  }
  if (ignored.length > 0 && onWarning) {
    onWarning(`Providers ignorés (non implémentés) : ${ignored.join(', ')}. Active uniquement gemini, claude, openai, deepseek, openrouter dans ta cascade.`)
  }
  return supported
}

export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  // Si forceProvider, respecter la préférence et retomber sur la cascade en fallback
  const cascadeFromStore = getProviderCascade(opts.onCascadeWarning)
  const cascade = opts.forceProvider
    ? [opts.forceProvider, ...cascadeFromStore.filter((p) => p !== opts.forceProvider)]
    : cascadeFromStore

  if (cascade.length === 0) {
    throw new Error(
      `[llmRouter] ${opts.task} : aucun provider LLM disponible dans ta cascade. ` +
      `Configure au moins un provider supporté (gemini, claude, deepseek) dans Réglages.`,
    )
  }

  const route = TASK_ROUTING[opts.task]
  const modelOverride = route.model

  let lastError: unknown = null
  const activity = useAiActivityStore.getState()
  for (let i = 0; i < cascade.length; i++) {
    const provider = cascade[i]
    const model = modelForProvider(provider, modelOverride)
    const activityId = nextAiActivityId(`json-${opts.task}`)
    activity.start({ id: activityId, provider, model, label: opts.task, kind: 'json' })
    let tokensIn = 0
    let tokensOut = 0
    let costUsd = 0
    const popListener = pushAiUsageListener((u) => {
      tokensIn += u.tokensIn
      tokensOut += u.tokensOut
      costUsd += u.costUsd
    })
    try {
      const result = await callProvider(provider, opts, modelOverride)
      popListener()
      activity.end(activityId, 'success', { inputTokens: tokensIn, outputTokens: tokensOut, costUsd })
      opts.onProviderUsed?.({ provider, model })
      return result
    } catch (err) {
      popListener()
      lastError = err
      const errAsErr = err instanceof Error ? err : new Error(String(err))
      activity.end(activityId, 'error', {
        errorMessage: errAsErr.message,
        inputTokens: tokensIn,
        outputTokens: tokensOut,
        costUsd,
      })
      opts.onProviderFailed?.({ provider, error: errAsErr })
      const nextProvider = cascade[i + 1]
      if (nextProvider) {
        console.warn(
          `[llmRouter] ${opts.task}: "${provider}" a échoué, fallback sur "${nextProvider}". Cause:`,
          err,
        )
      }
    }
  }

  // Tous les providers ont échoué
  throw lastError ?? new Error(`[llmRouter] ${opts.task}: aucun provider disponible`)
}

async function callProvider<T>(
  provider: LLMProviderId,
  opts: GenerateJsonOptions<T>,
  modelOverride?: string,
): Promise<T> {
  const model = modelForProvider(provider, modelOverride)
  if (provider === 'claude') {
    return await callClaude(opts, model)
  }
  if (provider === 'gemini') {
    return await geminiGenerateJson({
      prompt: opts.prompt,
      schema: opts.schema,
      schemaForGemini: opts.schemaForLLM,
      version: opts.version,
      model,
      onUsage: (u) => recordAiUsage({ provider: 'gemini', model, inputTokens: u.input, outputTokens: u.output }),
    })
  }
  if (provider === 'openai') {
    return await callOpenAI(opts, model)
  }
  if (provider === 'deepseek') {
    return await callDeepSeek(opts, model)
  }
  if (provider === 'openrouter') {
    return await callOpenRouter(opts, model)
  }
  throw new Error(`Provider inconnu : ${provider}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers OpenAI-compatible (DeepSeek, OpenRouter)
// ─────────────────────────────────────────────────────────────────────────────
//
// Ces backends acceptent `response_format: { type: 'json_object' }` mais PAS
// `json_schema` strict. On injecte le schéma dans le prompt pour guider la
// génération, puis on valide via Zod en sortie.

interface OpenAICompatibleConfig {
  providerId: 'deepseek' | 'openrouter'
  apiKeyId: string
  endpoint: string
  displayName: string
  /** Headers en plus de `Authorization` (ex. `HTTP-Referer` / `X-Title` pour OpenRouter). */
  extraHeaders?: Record<string, string>
}

const OPENAI_COMPATIBLE_PROVIDERS: Record<'deepseek' | 'openrouter', OpenAICompatibleConfig> = {
  deepseek: {
    providerId: 'deepseek',
    apiKeyId: 'deepseek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    displayName: 'DeepSeek',
  },
  openrouter: {
    providerId: 'openrouter',
    apiKeyId: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    displayName: 'OpenRouter',
    // OpenRouter exige un identifiant d'app pour le routing/rate-limit.
    extraHeaders: {
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'DesignStudio Web2Print',
    },
  },
}

const SCHEMA_INSTRUCTION_HEADER =
  `\n\n## SCHÉMA DE SORTIE OBLIGATOIRE\n` +
  `Réponds UNIQUEMENT par un JSON valide strictement conforme au schéma ci-dessous. ` +
  `Aucun texte avant ou après le JSON. Aucune balise markdown. Juste le JSON pur.\n\n`

async function callOpenAICompatible<T>(
  config: OpenAICompatibleConfig,
  opts: GenerateJsonOptions<T>,
  model: string,
): Promise<T> {
  const apiKey = getApiKey(config.apiKeyId)
  if (!apiKey) throw new Error(`Clé ${config.displayName} absente. Configurez-la dans Réglages.`)

  const fullPrompt = opts.prompt + SCHEMA_INSTRUCTION_HEADER + JSON.stringify(opts.schemaForLLM, null, 2)
  const temperature = TASK_TEMPERATURE[opts.task]
  const max_tokens = 8192

  opts.onRequestSent?.({
    provider: config.providerId,
    endpoint: config.endpoint,
    model,
    temperature,
    max_tokens,
    messages: [{ role: 'user', content: fullPrompt }],
    task: opts.task,
    version: opts.version,
  })

  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 180_000)

  let res: Response
  try {
    res = await fetch(config.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(config.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens,
        messages: [{ role: 'user', content: fullPrompt }],
        response_format: { type: 'json_object' },
      }),
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${config.displayName} API ${res.status} : ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  if (data.usage) {
    recordAiUsage({
      provider: config.providerId,
      model,
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
    })
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`${config.displayName} : réponse vide`)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(
      `${config.displayName} : JSON invalide (${err instanceof Error ? err.message : String(err)}). ` +
      `Sortie : ${text.slice(0, 200)}`,
    )
  }

  const validation = opts.schema.safeParse(parsed)
  if (validation.success) return validation.data
  throw new Error(
    `Réponse ${config.displayName} non conforme au schéma : ${validation.error.issues.map((i) => i.message).join(' ; ')}`,
  )
}

const callDeepSeek = <T>(opts: GenerateJsonOptions<T>, model: string) =>
  callOpenAICompatible(OPENAI_COMPATIBLE_PROVIDERS.deepseek, opts, model)

const callOpenRouter = <T>(opts: GenerateJsonOptions<T>, model: string) =>
  callOpenAICompatible(OPENAI_COMPATIBLE_PROVIDERS.openrouter, opts, model)

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
  usage?: { input_tokens?: number; output_tokens?: number }
}

/** Anthropic JSON Schema rejette `null`/`undefined` dans `input_schema` ;
 *  on retire récursivement toutes les valeurs nulles avant l'appel. */
function deepClean(obj: unknown): unknown {
  if (obj === null || obj === undefined) return undefined
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map(deepClean).filter((v) => v !== undefined)
  }
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const cleanValue = deepClean(value)
    if (cleanValue !== undefined) {
      cleaned[key] = cleanValue
    }
  }
  return cleaned
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
  const rawSchema = opts.schemaForClaude ?? opts.schemaForLLM
  const cleanSchema = deepClean(rawSchema)
  const tool = {
    name: toolName,
    description: 'Émet la réponse structurée conforme au schéma demandé.',
    input_schema: cleanSchema,
    cache_control: { type: 'ephemeral' as const },
  }

  const temperature = TASK_TEMPERATURE[opts.task]
  const max_tokens = 8192

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

  const requestPayload = {
    model,
    max_tokens,
    tools: [tool],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: messageContent }],
  }

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
      body: JSON.stringify(requestPayload),
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status} : ${body.slice(0, 300)}`)
  }

  const data = (await res.json()) as AnthropicResponse
  if (data.usage) {
    recordAiUsage({
      provider: 'claude',
      model,
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    })
  }
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
  if (retryData.usage) {
    recordAiUsage({
      provider: 'claude',
      model,
      inputTokens: retryData.usage.input_tokens ?? 0,
      outputTokens: retryData.usage.output_tokens ?? 0,
    })
  }
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
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  if (data.usage) {
    recordAiUsage({
      provider: 'openai',
      model,
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
    })
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
