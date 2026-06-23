// functions/src/higgsfield/higgsfieldGenerate.ts
// Callable proxy authentifié pour la génération Higgsfield (appelé par le node
// workflow côté navigateur). Lit la clé per-user depuis Firestore, délègue au
// cœur partagé. Aucune clé ne transite par le client.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getUserApiKey } from '../workflow/apiKeys'
import { runHiggsfield, type HiggsfieldParams, type HiggsfieldAsset } from './higgsfieldCore'

export const higgsfieldGenerate = onCall<HiggsfieldParams, Promise<{ assets: HiggsfieldAsset[] }>>(
  { timeoutSeconds: 540, memory: '512MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const uid = req.auth.uid
    const params = req.data
    if (!params || typeof params !== 'object') {
      throw new HttpsError('invalid-argument', 'Paramètres manquants')
    }
    if (params.mode !== 'image' && params.mode !== 'video') {
      throw new HttpsError('invalid-argument', 'mode doit être « image » ou « video »')
    }

    const credentials = await getUserApiKey(uid, 'higgsfield')
    if (!credentials) {
      throw new HttpsError(
        'failed-precondition',
        'Clé Higgsfield absente — ajoute-la dans Paramètres → Connecteurs.',
      )
    }

    try {
      const assets = await runHiggsfield(credentials, params)
      return { assets }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('[higgsfieldGenerate] échec', { uid, mode: params.mode, msg: msg.slice(0, 300) })
      throw new HttpsError('internal', `Higgsfield : ${msg.slice(0, 300)}`)
    }
  },
)
