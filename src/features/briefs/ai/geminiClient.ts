import { z } from 'zod'
import { getApiKey } from '@/lib/apiKeys'

const DEFAULT_MODEL = 'gemini-3.1-pro-preview'
const ENDPOINT = (model: string) => {
  // Gemini 3.5+ n'est servi que sur l'API stable `v1` (404 sur `v1beta`). Les modèles
  // -preview plus anciens (3.1, 2.5) restent sur `v1beta`.
  const version = /^gemini-3\.5/.test(model) ? 'v1' : 'v1beta'
  return `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`
}

interface GenerateJsonOptions<T> {
  prompt: string
  schema: z.ZodSchema<T>
  /** JSON Schema-like object passé à Gemini comme `responseSchema`. */
  schemaForGemini: Record<string, unknown>
  model?: string
  /** Identifiant du prompt pour traçabilité (stocké dans brief.aiVersions). */
  version: string
  /** Callback invoqué après chaque appel réussi avec les compteurs de tokens. */
  onUsage?: (u: { input: number; output: number }) => void
  /** Images base64 (data URIs) à inclure en multimodal — Gemini Vision. */
  imageDataUris?: string[]
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
}
interface GeminiResponse {
  candidates?: GeminiCandidate[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

/** Gemini `responseSchema` rejette certains mots-clés JSON Schema (ex:
 *  `additionalProperties`, `$schema`, `definitions`). On strip récursivement
 *  ces clés avant l'appel. Pour `additionalProperties: { type: 'string' }` sur
 *  un object sans `properties` défini, on laisse Gemini inférer librement. */
export function sanitizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForGemini)
  if (node === null || typeof node !== 'object') return node
  const STRIP = new Set(['additionalProperties', '$schema', 'definitions', '$defs', '$ref', 'patternProperties', 'oneOf', 'anyOf', 'allOf', 'not'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (STRIP.has(k)) continue
    out[k] = sanitizeSchemaForGemini(v)
  }
  return out
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  schemaForGemini: Record<string, unknown>,
  imageDataUris?: string[],
): Promise<{ text: string; usage: { input: number; output: number } }> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), 180_000)
  const sanitized = sanitizeSchemaForGemini(schemaForGemini) as Record<string, unknown>

  // Multimodal : les images sont des parts `inlineData` avant le texte. Gemini
  // attend juste le base64 brut (sans préfixe `data:...;base64,`) + le mimeType.
  type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
  const parts: Part[] = []
  for (const dataUri of imageDataUris ?? []) {
    const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) {
      console.warn('[Gemini] imageDataUri ignoré (format invalide) :', dataUri.slice(0, 40))
      continue
    }
    parts.push({ inlineData: { mimeType: match[1], data: match[2] } })
  }
  parts.push({ text: prompt })

  const res = await fetch(`${ENDPOINT(model)}?key=${apiKey}`, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      // Gemini 3.5 est servi sur l'API `v1` qui NE supporte PAS responseMimeType /
      // responseSchema / thinkingConfig (400 "Cannot find field"). On envoie une
      // config minimale ; le JSON est obtenu via le prompt + safeJsonParse côté caller.
      generationConfig: /^gemini-3\.5/.test(model)
        ? { temperature: 0.4, maxOutputTokens: 8192 }
        : {
            responseMimeType: 'application/json',
            responseSchema: sanitized,
            temperature: 0.4,
            maxOutputTokens: 8192,
            // Gemini 3.x : thinking dynamique consomme maxOutputTokens et peut tronquer
            // le JSON en sortie. Les modèles antérieurs ignorent ou rejettent ce champ.
            ...(/^gemini-3/i.test(model)
              ? { thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false } }
              : {}),
          },
    }),
  })

  clearTimeout(timeoutId)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiResponse
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini : réponse vide')
  return {
    text,
    usage: {
      input: data.usageMetadata?.promptTokenCount ?? 0,
      output: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

/**
 * Génère un objet JSON typé via Gemini, avec validation Zod et retry-on-fail.
 */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<T> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const model = opts.model ?? DEFAULT_MODEL

  // 1er essai
  const first = await callGemini(apiKey, model, opts.prompt, opts.schemaForGemini, opts.imageDataUris)
  opts.onUsage?.(first.usage)
  const firstParsed = safeJsonParse(first.text)
  const firstValidation = opts.schema.safeParse(firstParsed)
  if (firstValidation.success) return firstValidation.data

  // 2e essai avec injection d'erreur
  const errorMessage = firstValidation.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join(' ; ')
  const retryPrompt =
    opts.prompt +
    `\n\nErreur précédente : ${errorMessage}. Renvoie un JSON strictement conforme au schéma demandé.`
  const second = await callGemini(apiKey, model, retryPrompt, opts.schemaForGemini, opts.imageDataUris)
  opts.onUsage?.(second.usage)
  const secondParsed = safeJsonParse(second.text)
  const secondValidation = opts.schema.safeParse(secondParsed)
  if (secondValidation.success) return secondValidation.data

  throw new Error(
    `Réponse Gemini non conforme au schéma après retry : ${secondValidation.error.issues
      .map((i) => i.message)
      .join(' ; ')}`,
  )
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { /* tentatives de récupération ci-dessous */ }
  // Gemini renvoie parfois ```json ... ``` (malgré responseMimeType)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) {
    try { return JSON.parse(fence[1]) } catch { /* essai suivant */ }
  }
  // Sur l'endpoint v1 (sans responseSchema), Gemini préfixe/suffixe parfois le JSON
  // de prose ("Voici le JSON : …"). On extrait le 1er objet/tableau équilibré.
  const start = text.search(/[[{]/)
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'))
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* échec final */ }
  }
  throw new Error('Réponse Gemini non parsable en JSON')
}
