/**
 * Chat router — multi-tour, sans schéma JSON. Réutilise la cascade configurée
 * dans Réglages → IA (mêmes providers que generateJson).
 *
 * Per-provider mapping :
 *  - Claude Anthropic : separate `system` + messages user/assistant
 *  - Gemini : `contents` avec rôle user/model + systemInstruction
 *  - OpenAI / DeepSeek / OpenRouter : messages role/content (incl. system)
 */

import { getApiKey } from '@/lib/apiKeys'
import { recordAiUsage, pushAiUsageListener } from '@/features/stats/aiUsageTracking'
import { useAiActivityStore, nextAiActivityId } from '@/stores/aiActivity.store'
import {
  type LLMProviderId,
  getProviderCascade,
  modelForProvider,
} from '@/features/ai/llmRouter'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Images en data URI (data:image/...;base64,...) attachées au message user.
   *  Les providers multimodaux (Claude, Gemini) consomment ces images ; les
   *  autres ignorent silencieusement et n'aperçoivent que `content`. */
  imageDataUris?: string[]
}

export interface GenerateTextOptions {
  messages: ChatMessage[]
  /** System prompt optionnel (positionnement du modèle). */
  system?: string
  /** Override manuel du provider (debug / pinning). */
  forceProvider?: LLMProviderId
  /** Token-temperature des réponses (défaut 0.7 pour du chat conversationnel). */
  temperature?: number
  /** Plafond de tokens en sortie. */
  maxTokens?: number
  /** Callback : provider et modèle qui ont effectivement répondu. */
  onProviderUsed?: (info: { provider: LLMProviderId; model: string }) => void
  /** Callback : provider en échec (avant fallback). */
  onProviderFailed?: (info: { provider: LLMProviderId; error: Error }) => void
  /** Callback : warning sur la cascade (ex. provider non implémenté ignoré). */
  onCascadeWarning?: (warning: string) => void
  /** Force la sortie en JSON valide. Sur Gemini → `responseMimeType: application/json`.
   *  Sur OpenAI-compat (OpenAI, DeepSeek, OpenRouter) → `response_format: { type: 'json_object' }`.
   *  Sur Claude : ignoré (Anthropic gère JSON via system prompt). */
  responseFormat?: 'json'
}

export interface GenerateTextResult {
  text: string
  provider: LLMProviderId
  model: string
}

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const cascadeFromStore = getProviderCascade(opts.onCascadeWarning)
  const cascade = opts.forceProvider
    ? [opts.forceProvider, ...cascadeFromStore.filter((p) => p !== opts.forceProvider)]
    : cascadeFromStore

  if (cascade.length === 0) {
    throw new Error(
      '[chatRouter] aucun provider LLM disponible. ' +
        'Configure gemini, claude, openai, deepseek ou openrouter dans Réglages → IA.',
    )
  }

  let lastError: unknown = null
  const activity = useAiActivityStore.getState()
  for (let i = 0; i < cascade.length; i++) {
    const provider = cascade[i]
    const model = modelForProvider(provider)
    const activityId = nextAiActivityId('chat')
    activity.start({ id: activityId, provider, model, label: 'chat', kind: 'chat' })
    let tokensIn = 0
    let tokensOut = 0
    let costUsd = 0
    const popListener = pushAiUsageListener((u) => {
      tokensIn += u.tokensIn
      tokensOut += u.tokensOut
      costUsd += u.costUsd
    })
    try {
      const text = await dispatch(provider, model, opts)
      popListener()
      activity.end(activityId, 'success', { inputTokens: tokensIn, outputTokens: tokensOut, costUsd })
      opts.onProviderUsed?.({ provider, model })
      return { text, provider, model }
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
      const next = cascade[i + 1]
      if (next) console.warn(`[chatRouter] "${provider}" a échoué, fallback sur "${next}":`, err)
    }
  }
  throw lastError ?? new Error('[chatRouter] aucun provider disponible')
}

async function dispatch(
  provider: LLMProviderId,
  model: string,
  opts: GenerateTextOptions,
): Promise<string> {
  if (provider === 'claude') return await chatClaude(opts, model)
  if (provider === 'gemini') return await chatGemini(opts, model)
  if (provider === 'openai') return await chatOpenAI(opts, model)
  if (provider === 'deepseek') return await chatDeepSeek(opts, model)
  if (provider === 'openrouter') return await chatOpenRouter(opts, model)
  throw new Error(`Provider chat inconnu : ${provider}`)
}

const TIMEOUT_MS = 180_000
const DEFAULT_TEMP = 0.7
const DEFAULT_MAX_TOKENS = 4096

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  return { signal: ctrl.signal, clear: () => clearTimeout(id) }
}

// ─── Claude (Anthropic) ──────────────────────────────────────────────────────

async function chatClaude(opts: GenerateTextOptions, model: string): Promise<string> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) throw new Error('Clé Anthropic absente.')

  const { signal, clear } = withTimeout()
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: opts.temperature ?? DEFAULT_TEMP,
        ...(opts.system ? { system: opts.system } : {}),
        messages: opts.messages.map((m) => {
          // Multimodal : images d'abord, texte ensuite (Anthropic recommend cet
          // ordre). Pour les messages sans images, on garde la forme string.
          if (m.role === 'user' && m.imageDataUris && m.imageDataUris.length > 0) {
            const blocks: Array<Record<string, unknown>> = []
            for (const uri of m.imageDataUris) {
              const match = uri.match(/^data:([^;]+);base64,(.+)$/)
              if (!match) continue
              blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: match[1], data: match[2] },
              })
            }
            blocks.push({ type: 'text', text: m.content || '' })
            return { role: m.role, content: blocks }
          }
          return { role: m.role, content: m.content }
        }),
      }),
    })
  } finally {
    clear()
  }

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 2000)}`)

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  if (data.usage) {
    recordAiUsage({
      provider: 'claude',
      model,
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    })
  }
  const text = data.content?.find((b) => b.type === 'text')?.text
  if (!text) throw new Error('Claude : réponse vide')
  return text
}

// ─── Gemini (Google) ─────────────────────────────────────────────────────────

async function chatGemini(opts: GenerateTextOptions, model: string): Promise<string> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente.')

  const contents = opts.messages.map((m) => {
    const parts: Array<Record<string, unknown>> = []
    if (m.role === 'user' && m.imageDataUris) {
      for (const uri of m.imageDataUris) {
        const match = uri.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
        }
      }
    }
    if (m.content || parts.length === 0) {
      parts.push({ text: m.content })
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts }
  })

  const { signal, clear } = withTimeout()
  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          ...(opts.system
            ? { systemInstruction: { role: 'user', parts: [{ text: opts.system }] } }
            : {}),
          generationConfig: {
            temperature: opts.temperature ?? DEFAULT_TEMP,
            maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
            // Gemini 3.x : thinking dynamique consomme maxOutputTokens et tronque la
            // sortie. On force le plus bas niveau supporté. Les anciens modèles
            // (1.5/2.0/2.5) ignorent ce champ ou erreur → on ne l'applique qu'à G3+.
            ...(/^gemini-3/i.test(model)
              ? { thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false } }
              : {}),
            ...(opts.responseFormat === 'json' ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    )
  } finally {
    clear()
  }

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 2000)}`)

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      thoughtsTokenCount?: number
    }
  }
  if (data.usageMetadata) {
    recordAiUsage({
      provider: 'gemini',
      model,
      inputTokens: data.usageMetadata.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
    })
  }
  const candidate = data.candidates?.[0]
  const text =
    candidate?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('') ?? ''
  if (!text) {
    const finishReason = candidate?.finishReason ?? 'unknown'
    const thoughtsTokens = data.usageMetadata?.thoughtsTokenCount ?? 0
    throw new Error(
      `Gemini : réponse vide (finishReason=${finishReason}, thoughtsTokens=${thoughtsTokens}, ` +
        `outputTokens=${data.usageMetadata?.candidatesTokenCount ?? 0})`,
    )
  }
  return text
}

// ─── OpenAI-compatible (factor) ──────────────────────────────────────────────

interface OpenAICompatibleConfig {
  endpoint: string
  apiKey: string
  extraHeaders?: Record<string, string>
  providerKey: 'openai' | 'deepseek' | 'openrouter'
}

async function chatOpenAICompatible(
  opts: GenerateTextOptions,
  model: string,
  cfg: OpenAICompatibleConfig,
): Promise<string> {
  type OAIContent = string | Array<Record<string, unknown>>
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: OAIContent }> = []
  if (opts.system) messages.push({ role: 'system', content: opts.system })
  for (const m of opts.messages) {
    if (m.role === 'user' && m.imageDataUris && m.imageDataUris.length > 0) {
      // Format multimodal OpenAI : array de blocks {type: "text"|"image_url"}.
      // Compatible GPT-4o, OpenRouter (Claude/Gemini routés), DeepSeek-VL.
      const blocks: Array<Record<string, unknown>> = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const uri of m.imageDataUris) {
        blocks.push({ type: 'image_url', image_url: { url: uri } })
      }
      messages.push({ role: m.role, content: blocks })
    } else {
      messages.push({ role: m.role, content: m.content })
    }
  }

  const { signal, clear } = withTimeout()
  let res: Response
  try {
    res = await fetch(cfg.endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? DEFAULT_TEMP,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        messages,
        ...(opts.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  } finally {
    clear()
  }

  if (!res.ok) throw new Error(`${cfg.providerKey} ${res.status}: ${(await res.text()).slice(0, 2000)}`)

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  if (data.usage) {
    recordAiUsage({
      provider: cfg.providerKey,
      model,
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
    })
  }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error(`${cfg.providerKey} : réponse vide`)
  return text
}

async function chatOpenAI(opts: GenerateTextOptions, model: string): Promise<string> {
  const apiKey = getApiKey('openai')
  if (!apiKey) throw new Error('Clé OpenAI absente.')
  return chatOpenAICompatible(opts, model, {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey,
    providerKey: 'openai',
  })
}

async function chatDeepSeek(opts: GenerateTextOptions, model: string): Promise<string> {
  const apiKey = getApiKey('deepseek')
  if (!apiKey) throw new Error('Clé DeepSeek absente.')
  return chatOpenAICompatible(opts, model, {
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    apiKey,
    providerKey: 'deepseek',
  })
}

async function chatOpenRouter(opts: GenerateTextOptions, model: string): Promise<string> {
  const apiKey = getApiKey('openrouter')
  if (!apiKey) throw new Error('Clé OpenRouter absente.')
  const cfg = {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    providerKey: 'openrouter' as const,
    extraHeaders: {
      'HTTP-Referer': window.location.origin,
      'X-Title': 'DesignStudio Web2Print',
    },
  }
  try {
    return await chatOpenAICompatible(opts, model, cfg)
  } catch (err) {
    // OpenRouter 402 = crédits insuffisants. Le message indique le plafond
    // que peut couvrir le compte ("can only afford N"). On retente une fois
    // avec ce plafond — ça permet d'utiliser le provider primaire malgré les
    // crédits limités, plutôt que de basculer aveuglément sur le fallback.
    const message = err instanceof Error ? err.message : String(err)
    const m = message.match(/can only afford (\d+)/i)
    if (m && message.includes('402')) {
      const affordable = Math.max(64, parseInt(m[1], 10) - 10)
      console.warn(
        `[chatRouter] OpenRouter 402 — retry avec max_tokens=${affordable} (compte limité).`,
      )
      return chatOpenAICompatible({ ...opts, maxTokens: affordable }, model, cfg)
    }
    throw err
  }
}
