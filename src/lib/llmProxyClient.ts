// src/lib/llmProxyClient.ts
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
