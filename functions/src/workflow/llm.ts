// functions/src/workflow/llm.ts
import { getUserApiKey } from './apiKeys'

export interface LlmResult { text: string; model: string }

async function callAnthropic(key: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: { text?: string }[] }
  return json.content?.map((c) => c.text ?? '').join('') ?? ''
}

async function callGemini(key: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 4096 },
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

/** Anthropic d'abord, fallback Gemini. Lève si aucune clé/aucun provider ne répond. */
export async function callLlm(uid: string, prompt: string): Promise<LlmResult> {
  const anthropic = await getUserApiKey(uid, 'anthropic')
  if (anthropic) {
    try { return { text: await callAnthropic(anthropic, prompt), model: 'claude-opus-4-7' } } catch { /* fallback */ }
  }
  const gemini = await getUserApiKey(uid, 'gemini')
  if (gemini) return { text: await callGemini(gemini, prompt), model: 'gemini-3.1-pro-preview' }
  throw new Error('Aucune clé LLM (anthropic/gemini) configurée pour cet utilisateur.')
}

/** Extrait le premier bloc JSON d'une réponse LLM (tolère les ```json fences). */
export function parseLlmJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) return null
  try { return JSON.parse(raw.slice(start)) as T } catch { return null }
}
