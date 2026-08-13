// functions/src/workflow/llm.ts
import { getFirestore } from 'firebase-admin/firestore'
import { getUserApiKey } from './apiKeys'

export interface LlmResult {
  text: string
  /** Provider retenu dans la cascade — le journal de run l'affiche à côté du modèle. */
  provider: string
  model: string
  stopReason?: string
}

const DEFAULT_MAX_TOKENS = 8192

/**
 * Appel HTTP BORNÉ dans le temps.
 *
 * ⚠⚠ Aucun appel au modèle n'en avait. Un fournisseur qui ne répond pas — connexion
 * suspendue, passerelle muette, quota qui fait traîner la requête — bloquait la carte
 * INDÉFINIMENT : l'échéance de restitution n'est vérifiée qu'ENTRE deux lots, jamais
 * pendant. La carte restait « en cours » jusqu'au verrou du run, et les cartes AVAL
 * n'étaient jamais exécutées.
 *
 * Cas VÉCU, mesuré : cinq cycles consécutifs sans que « Comparer catalogue » ne démarre une
 * seule fois — son journal disait « aucun traitement pour l'instant » — pendant que le
 * tableau de bord restait figé trois heures sur une analyse périmée. Le journal du serveur
 * répétait par ailleurs « Aucun provider LLM n'a répondu » : les appels ne revenaient pas.
 *
 * Deux minutes : un lot de quatorze textes met dix à trente secondes chez tous les
 * fournisseurs. Au-delà, ce n'est plus de la lenteur, c'est une réponse qui ne viendra pas —
 * et la cascade doit pouvoir essayer le fournisseur suivant tant qu'il reste du temps.
 */
const LLM_TIMEOUT_MS = 120_000

async function fetchLlm(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } catch (e) {
    // Un abort doit se lire comme un dépassement, pas comme une panne réseau obscure : la
    // cascade journalise ce message et c'est lui qu'on retrouve dans la console du run.
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Délai dépassé (${LLM_TIMEOUT_MS / 1000} s) — le fournisseur n'a pas répondu.`, { cause: e })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** DeepSeek (OpenAI-compatible) avec JSON natif (response_format json_object) :
 *  garantit une réponse JSON pure (pas de prose ni de bloc markdown) → parse direct
 *  fiable. deepseek-chat plafonne à 8192 tokens de sortie → clamp. */
async function callDeepSeek(key: string, prompt: string, maxTokens: number, model: string): Promise<{ text: string; stopReason?: string }> {
  const res = await fetchLlm('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: Math.min(maxTokens, 8192),
    }),
  })
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  const c = json.choices?.[0]
  return { text: c?.message?.content ?? '', stopReason: c?.finish_reason }
}

async function callAnthropic(key: string, prompt: string, maxTokens: number, model: string): Promise<{ text: string; stopReason?: string }> {
  const res = await fetchLlm('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { content?: { text?: string }[]; stop_reason?: string }
  return { text: json.content?.map((c) => c.text ?? '').join('') ?? '', stopReason: json.stop_reason }
}

/** OpenAI (gpt-5.1) avec JSON natif. Les modèles gpt-5.x utilisent max_completion_tokens. */
async function callOpenAI(key: string, prompt: string, maxTokens: number, model: string): Promise<{ text: string; stopReason?: string }> {
  const res = await fetchLlm('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_completion_tokens: maxTokens,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  const c = json.choices?.[0]
  return { text: c?.message?.content ?? '', stopReason: c?.finish_reason }
}

async function callGemini(key: string, prompt: string, maxTokens: number, model: string): Promise<{ text: string; stopReason?: string }> {
  const res = await fetchLlm(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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

/** Providers supportés côté serveur : keyId (users/{uid}.apiKeys.overrides), modèle, appel. */
const PROVIDERS: Record<string, { keyId: string; model: string; call: (key: string, prompt: string, max: number, model: string) => Promise<{ text: string; stopReason?: string }> }> = {
  deepseek: { keyId: 'deepseek', model: 'deepseek-chat', call: callDeepSeek },
  gemini: { keyId: 'gemini', model: 'gemini-3.1-pro-preview', call: callGemini },
  openai: { keyId: 'openai', model: 'gpt-5.1', call: callOpenAI },
  claude: { keyId: 'anthropic', model: 'claude-opus-4-7', call: callAnthropic },
  anthropic: { keyId: 'anthropic', model: 'claude-opus-4-7', call: callAnthropic },
}

/** Cascade de raisonnement de l'utilisateur (users/{uid}.aiSettings.reasoningCascade).
 *  Défaut sans Anthropic (épuisé / hors choix par défaut). */
async function getCascade(uid: string): Promise<{ cascade: string[]; models: Record<string, string> }> {
  try {
    const snap = await getFirestore().doc(`users/${uid}`).get()
    const ai = snap.data()?.aiSettings as {
      reasoningCascade?: unknown
      selectedModel?: Record<string, unknown>
    } | undefined
    const c = ai?.reasoningCascade
    // ⚠⚠ Le MODÈLE choisi par l'utilisateur, pas celui codé en dur. Les réglages IA
    // laissent choisir « deepseek-v4-flash » et le cron appelait « deepseek-chat » : le
    // réglage n'avait aucun effet côté serveur, et personne ne pouvait le deviner — sur
    // 200 000 champs, le modèle décide de la facture ET de la qualité.
    const models: Record<string, string> = {}
    for (const [k, v] of Object.entries(ai?.selectedModel ?? {})) {
      if (typeof v === 'string' && v.trim()) models[k] = v.trim()
    }
    return {
      cascade: Array.isArray(c) && c.length > 0 ? c.map(String) : ['deepseek', 'gemini', 'openai'],
      models,
    }
  } catch { /* défaut */ }
  return { cascade: ['deepseek', 'gemini', 'openai'], models: {} }
}

/** Ordre d'essai des providers : les `prefer` en tête (modèles plus fiables pour une
 *  tâche donnée — ex extraction JSON exhaustive), puis la cascade de l'utilisateur en
 *  repli. Dédupliqué, ordre préservé. Un préféré sans clé est simplement sauté à l'appel,
 *  donc la cascade reprend la main : aucune régression si l'utilisateur n'a pas la clé. */
export function buildProviderOrder(prefer: string[], cascade: string[]): string[] {
  return [...prefer, ...cascade].filter((p, i, a) => a.indexOf(p) === i)
}

/** Suit la cascade CONFIGURÉE par l'utilisateur (pas un ordre hardcodé) : pour chaque
 *  provider, tente avec sa clé, passe au suivant en cas d'absence/échec. `preferProviders`
 *  place certains providers en tête sans casser le repli sur la cascade. */
export async function callLlm(uid: string, prompt: string, opts: { maxTokens?: number; preferProviders?: string[] } = {}): Promise<LlmResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS
  const { cascade, models } = await getCascade(uid)
  const order = buildProviderOrder(opts.preferProviders ?? [], cascade)
  for (const provider of order) {
    const p = PROVIDERS[provider]
    if (!p) { console.warn(`[llm] provider « ${provider} » non supporté côté serveur — ignoré.`); continue }
    const key = await getUserApiKey(uid, p.keyId)
    if (!key) continue
    try {
      // `anthropic` et `claude` désignent le même fournisseur : le réglage est rangé
      // sous la clé d'API, pas sous l'alias de cascade.
      const chosen = models[provider] ?? models[p.keyId] ?? p.model
      const r = await p.call(key, prompt, maxTokens, chosen)
      if (r.text.trim()) return { text: r.text, provider, model: chosen, stopReason: r.stopReason }
    } catch (e) {
      console.warn(`[llm] ${provider} KO → provider suivant :`, e instanceof Error ? e.message.slice(0, 200) : e)
    }
  }
  throw new Error(`Aucun provider LLM (${order.join(', ')}) n'a répondu — vérifie les clés API.`)
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
