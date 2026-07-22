// functions/src/llm/listModels.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getUserApiKey } from '../workflow/apiKeys'
import {
  LIST_MODELS_PROVIDERS,
  buildModelsRequest,
  keyIdForListProvider,
  needsKeyForListing,
  type ListModelsProvider,
} from './modelsListing'

interface ListModelsData {
  provider?: string
}

/**
 * Liste les modèles texte/JSON d'un provider, côté serveur. Le navigateur ne
 * peut pas interroger la plupart des endpoints `/models` (CORS) ; cette CF fait
 * le GET sans cette contrainte, en lisant la clé du user en Firestore
 * (`users/{uid}.apiKeys.overrides`). Renvoie la réponse provider verbatim
 * ({ status, body }) — le parsing est fait côté client (llmProxy-style).
 */
export const listModels = onCall<ListModelsData, Promise<{ status: number; body: string }>>(
  { timeoutSeconds: 60, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const uid = req.auth.uid
    const provider = req.data?.provider as ListModelsProvider
    if (!LIST_MODELS_PROVIDERS.includes(provider)) {
      throw new HttpsError('invalid-argument', `Provider non supporté : ${String(req.data?.provider)}`)
    }

    const apiKey = await getUserApiKey(uid, keyIdForListProvider(provider))
    if (needsKeyForListing(provider) && !apiKey) {
      throw new HttpsError(
        'failed-precondition',
        `Clé ${keyIdForListProvider(provider)} absente du profil — enregistre-la dans Réglages → Connecteurs.`,
      )
    }

    const spec = buildModelsRequest(provider, apiKey)
    try {
      const res = await fetch(spec.url, { method: 'GET', headers: spec.headers })
      const text = await res.text()
      if (!res.ok) {
        logger.warn('[listModels] provider non-2xx', { uid, provider, status: res.status, body: text.slice(0, 200) })
      }
      return { status: res.status, body: text }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[listModels] échec réseau provider', { uid, provider, msg: msg.slice(0, 200) })
      throw new HttpsError('unavailable', `Échec de l'appel ${provider} : ${msg.slice(0, 200)}`)
    }
  },
)
