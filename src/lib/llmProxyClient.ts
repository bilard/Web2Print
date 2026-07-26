/**
 * Client du proxy LLM serveur (`llmProxy` Cloud Function).
 *
 * Chemin principal : la requête provider (payload JSON complet, SANS clé API)
 * part vers la callable authentifiée qui ajoute la clé du user (Firestore) et
 * applique son budget mensuel. Le retour {status, body} est enveloppé dans un
 * objet compatible `Response` pour que les routeurs existants (llmRouter,
 * geminiClient) gardent leur code de parsing inchangé.
 *
 * Fallback direct (fetch navigateur, comme avant) UNIQUEMENT si :
 *  - le payload dépasse la limite des callables (~10 Mo) — multimodal lourd ;
 *  - la Function est indisponible / clé absente côté Firestore.
 * Budget atteint (`resource-exhausted`) ne fallback JAMAIS : c'est l'enforcement.
 */
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { getApiKey } from '@/lib/apiKeys'

export type LlmProxyProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'openrouter'

interface LlmProxyRequest {
  provider: LlmProxyProvider
  model: string
  body: Record<string, unknown>
}
interface LlmProxyResult {
  status: number
  body: string
}

/** Marge sous la limite 10 Mo des callables (sérialisation + enveloppe). */
const MAX_PROXY_PAYLOAD_BYTES = 9_000_000

export class LlmBudgetError extends Error {}

/** Sous-ensemble de Response utilisé par les routeurs LLM (ok/status/text/json). */
export interface LlmHttpResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
  json: () => Promise<unknown>
}

const callLlmProxy = httpsCallable<LlmProxyRequest, LlmProxyResult>(functions, 'llmProxy', { timeout: 300_000 })

const DIRECT_KEY_IDS: Record<LlmProxyProvider, string> = {
  claude: 'anthropic',
  gemini: 'gemini',
  openai: 'openai',
  deepseek: 'deepseek',
  openrouter: 'openrouter',
}

/** Requête direct-navigateur équivalente à celle du serveur (proxyCore) —
 *  utilisée par le fallback générique quand le proxy est indisponible. */
function buildDirectRequest(provider: LlmProxyProvider, model: string, apiKey: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }
    case 'gemini': {
      const version = /^gemini-3\.5/.test(model) ? 'v1' : 'v1beta'
      return { url: `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`, headers: {} }
    }
    case 'openai':
      return { url: 'https://api.openai.com/v1/chat/completions', headers: { Authorization: `Bearer ${apiKey}` } }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/chat/completions', headers: { Authorization: `Bearer ${apiKey}` } }
    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
          'X-Title': 'IBS-Studio',
        },
      }
  }
}

/**
 * Variante clé-en-main : POST via le proxy, avec un fallback direct STANDARD
 * (même endpoint/headers que le serveur). Pour les routeurs qui n'ont pas
 * besoin d'un fallback sur mesure — la clé locale n'est requise que si le
 * proxy est indisponible.
 */
export async function llmPostWithFallback(
  provider: LlmProxyProvider,
  model: string,
  body: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<LlmHttpResponse | Response> {
  return llmFetchViaProxy(provider, model, body, async () => {
    const keyId = DIRECT_KEY_IDS[provider]
    const apiKey = getApiKey(keyId)
    if (!apiKey) throw new Error(`Clé ${keyId} absente. Configurez-la dans Réglages.`)
    const { url, headers } = buildDirectRequest(provider, model, apiKey)
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      return await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    } finally {
      clearTimeout(timeoutId)
    }
  })
}

export async function llmFetchViaProxy(
  provider: LlmProxyProvider,
  model: string,
  body: Record<string, unknown>,
  directFallback: () => Promise<LlmHttpResponse | Response>,
): Promise<LlmHttpResponse | Response> {
  if (JSON.stringify(body).length > MAX_PROXY_PAYLOAD_BYTES) {
    return directFallback()
  }
  try {
    const res = await callLlmProxy({ provider, model, body })
    const { status, body: text } = res.data
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    }
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    if (code === 'functions/resource-exhausted') {
      throw new LlmBudgetError(err instanceof Error ? err.message : 'Budget LLM mensuel atteint')
    }
    // failed-precondition (clé absente en Firestore), unavailable, internal,
    // réseau… → continuité de service via l'appel direct historique.
    console.warn(`[llmProxyClient] proxy ${provider} indisponible (${code || 'réseau'}) → appel direct`, err)
    return directFallback()
  }
}
