// functions/src/llm/llmProxy.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getFirestore } from 'firebase-admin/firestore'
import { getUserApiKey } from '../workflow/apiKeys'
import {
  PROXY_PROVIDERS,
  buildProviderRequest,
  isOverBudget,
  keyIdForProvider,
  type LlmProxyProvider,
} from './proxyCore'

interface LlmProxyData {
  provider?: string
  model?: string
  body?: Record<string, unknown>
}

/**
 * Proxy LLM authentifié : le navigateur n'envoie plus sa clé API aux providers,
 * il envoie la requête au proxy qui lit la clé du user en Firestore
 * (users/{uid}.apiKeys.overrides) et applique son budget mensuel
 * (users/{uid}.aiSettings.monthlyBudgetUsd vs aiUsage/{uid}_{YYYY-MM}).
 * La réponse provider est retournée verbatim ({status, body texte}) — la
 * validation Zod et le tracking d'usage restent côté client (llmRouter).
 */
export const llmProxy = onCall<LlmProxyData, Promise<{ status: number; body: string }>>(
  { timeoutSeconds: 300, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const uid = req.auth.uid
    const provider = req.data?.provider as LlmProxyProvider
    const model = req.data?.model
    const body = req.data?.body
    if (!PROXY_PROVIDERS.includes(provider)) {
      throw new HttpsError('invalid-argument', `Provider non supporté : ${String(req.data?.provider)}`)
    }
    if (!model || typeof model !== 'string') throw new HttpsError('invalid-argument', 'model manquant')
    if (!body || typeof body !== 'object') throw new HttpsError('invalid-argument', 'body manquant')

    const keyId = keyIdForProvider(provider)
    const apiKey = await getUserApiKey(uid, keyId)
    if (!apiKey) {
      throw new HttpsError('failed-precondition', `Clé ${keyId} absente du profil Firestore — enregistre-la dans Réglages → Connecteurs.`)
    }

    const db = getFirestore()
    const month = new Date().toISOString().slice(0, 7)
    const [userSnap, usageSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`aiUsage/${uid}_${month}`).get(),
    ])
    const budgets = (userSnap.data()?.aiSettings?.monthlyBudgetUsd ?? {}) as Record<string, number | null>
    const budget = budgets[provider]
    const spent = (usageSnap.data()?.byProvider?.[provider]?.costUsd ?? 0) as number
    if (isOverBudget(budget, spent)) {
      throw new HttpsError(
        'resource-exhausted',
        `Budget mensuel ${provider} atteint (${spent.toFixed(2)} / ${budget} USD). Ajuste-le dans Réglages → IA.`,
      )
    }

    const spec = buildProviderRequest(provider, model, apiKey)
    try {
      const res = await fetch(spec.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...spec.headers },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      if (!res.ok) {
        logger.warn('[llmProxy] provider non-2xx', { uid, provider, model, status: res.status, body: text.slice(0, 200) })
      }
      return { status: res.status, body: text }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[llmProxy] échec réseau provider', { uid, provider, model, msg: msg.slice(0, 200) })
      throw new HttpsError('unavailable', `Échec de l'appel ${provider} : ${msg.slice(0, 200)}`)
    }
  },
)
