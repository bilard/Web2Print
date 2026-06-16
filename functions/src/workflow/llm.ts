// functions/src/workflow/llm.ts
import { getUserApiKey } from './apiKeys'

export interface LlmResult { text: string; model: string; stopReason?: string }

const DEFAULT_MAX_TOKENS = 8192

async function callAnthropic(key: string, prompt: string, maxTokens: number): Promise<{ text: string; stopReason?: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-opus-4-7', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: { text?: string }[]; stop_reason?: string }
  return { text: json.content?.map((c) => c.text ?? '').join('') ?? '', stopReason: json.stop_reason }
}

async function callGemini(key: string, prompt: string, maxTokens: number): Promise<{ text: string; stopReason?: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: maxTokens },
      }),
    },
  )
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }
  const cand = json.candidates?.[0]
  return { text: cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '', stopReason: cand?.finishReason }
}

/** Anthropic d'abord, fallback Gemini. Lève si aucune clé/aucun provider ne répond. */
export async function callLlm(uid: string, prompt: string, opts: { maxTokens?: number } = {}): Promise<LlmResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const anthropic = await getUserApiKey(uid, 'anthropic')
  if (anthropic) {
    try {
      const r = await callAnthropic(anthropic, prompt, maxTokens)
      return { text: r.text, model: 'claude-opus-4-7', stopReason: r.stopReason }
    } catch (e) {
      // Fallback non silencieux : tracer pourquoi Anthropic a échoué (clé/quota/timeout).
      console.warn('[llm] Anthropic KO → fallback Gemini :', e instanceof Error ? e.message.slice(0, 200) : e)
    }
  }
  const gemini = await getUserApiKey(uid, 'gemini')
  if (gemini) {
    const r = await callGemini(gemini, prompt, maxTokens)
    return { text: r.text, model: 'gemini-3.1-pro-preview', stopReason: r.stopReason }
  }
  throw new Error('Aucune clé LLM (anthropic/gemini) configurée pour cet utilisateur.')
}

/** Sous-chaîne JSON équilibrée à partir de l'index `from` (un `{` ou `[`), en
 *  respectant strings/échappements. null si la structure n'est jamais refermée
 *  (réponse tronquée). Tolère ainsi du texte AVANT et APRÈS le JSON — le LLM
 *  préface ou conclut souvent (« Voici les 27 tondeuses… »), ce qui faisait
 *  échouer un simple slice-jusqu'à-la-fin. */
function balancedJson(s: string, from: number): string | null {
  const open = s[from]
  const close = open === '{' ? '}' : ']'
  let depth = 0, inStr = false, esc = false
  for (let i = from; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return s.slice(from, i + 1) }
  }
  return null
}

/** Extrait le premier bloc JSON d'une réponse LLM (tolère ```json fences + prose). */
export function parseLlmJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fenced ? fenced[1] : text).trim()
  const start = raw.search(/[[{]/)
  if (start < 0) return null
  const block = balancedJson(raw, start)
  if (!block) return null
  try { return JSON.parse(block) as T } catch { return null }
}

/** Récupère les objets `{…}` de premier niveau d'une réponse LLM, même quand le
 *  parse global échoue : tableau tronqué (réponse coupée) ou enrobé de prose.
 *  Pour l'extraction de listes, N-1 objets valides valent mieux que 0. */
export function recoverJsonObjects(text: string): Record<string, unknown>[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const out: Record<string, unknown>[] = []
  // Démarrer dans le corps du 1er tableau s'il existe (sinon balayer tout le texte),
  // pour ne pas capturer l'objet racine { "products": [...] } en entier.
  const arr = raw.indexOf('[')
  let i = arr >= 0 ? arr + 1 : 0
  while (i < raw.length) {
    if (raw[i] === '{') {
      const block = balancedJson(raw, i)
      if (!block) break // dernier objet tronqué → on garde les précédents
      try { out.push(JSON.parse(block) as Record<string, unknown>) } catch { /* objet ignoré */ }
      i += block.length
    } else i++
  }
  return out
}
