// functions/src/llm/listModels.ts
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getUserApiKey } from '../workflow/apiKeys'
import {
  LIST_MODELS_PROVIDERS,
  buildModelsRequest,
  keyIdForListProvider,
  needsKeyForListing,
  nextModelsPageToken,
  mergeModelsPages,
  MAX_MODEL_PAGES,
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

    try {
      // ⚠⚠ Gemini PAGINE (50 modèles par défaut, 1000 au plus par page) : sans suivre le
      // jeton, les modèles les plus RÉCENTS restaient hors de la première page et le
      // rafraîchissement annonçait « aucun nouveau modèle ». Les autres providers rendent
      // tout d'un coup — `nextModelsPageToken` leur répond `null` dès la première passe,
      // donc cette boucle vaut exactement une requête pour eux.
      const bodies: string[] = []
      let token: string | undefined
      let status = 200
      for (let page = 0; page < MAX_MODEL_PAGES; page++) {
        const spec = buildModelsRequest(provider, apiKey, token)
        const res = await fetch(spec.url, { method: 'GET', headers: spec.headers })
        const text = await res.text()
        status = res.status
        if (!res.ok) {
          logger.warn('[listModels] provider non-2xx', { uid, provider, status: res.status, body: text.slice(0, 200) })
          // Première page en erreur : on rend l'erreur du provider telle quelle, c'est
          // elle qui porte le message actionnable. Page suivante en erreur : on garde ce
          // qui est déjà lu plutôt que de tout perdre.
          if (page === 0) return { status: res.status, body: text }
          break
        }
        bodies.push(text)
        const next = nextModelsPageToken(provider, text)
        if (!next) break
        token = next
      }
      return { status, body: bodies.length > 1 ? mergeModelsPages(bodies) : (bodies[0] ?? '') }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.error('[listModels] échec réseau provider', { uid, provider, msg: msg.slice(0, 200) })
      throw new HttpsError('unavailable', `Échec de l'appel ${provider} : ${msg.slice(0, 200)}`)
    }
  },
)
