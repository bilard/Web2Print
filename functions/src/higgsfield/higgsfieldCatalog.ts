// functions/src/higgsfield/higgsfieldCatalog.ts
// Callable lecture seule : retourne le catalogue Higgsfield (styles Soul + motions
// DoP) pour peupler les sélecteurs du node. Endpoints GET → pas de crédit consommé.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getUserApiKey } from '../workflow/apiKeys'
import { fetchHiggsfieldCatalog, type HiggsfieldCatalog } from './higgsfieldCore'

export const higgsfieldCatalog = onCall<Record<string, never>, Promise<HiggsfieldCatalog>>(
  { timeoutSeconds: 60, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const credentials = await getUserApiKey(req.auth.uid, 'higgsfield')
    if (!credentials) {
      throw new HttpsError('failed-precondition', 'Clé Higgsfield absente — Paramètres → Connecteurs.')
    }
    if (!credentials.includes(':')) {
      throw new HttpsError(
        'failed-precondition',
        'Clé Higgsfield invalide : saisis l\'ID ET le secret COLLÉS au format KEY_ID:KEY_SECRET.',
      )
    }
    try {
      return await fetchHiggsfieldCatalog(credentials)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('[higgsfieldCatalog] échec', { uid: req.auth.uid, msg: msg.slice(0, 200) })
      throw new HttpsError('internal', `Higgsfield catalogue : ${msg.slice(0, 200)}`)
    }
  },
)
