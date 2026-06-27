// functions/src/dam/damDelete.ts
// Callable : déplace des fichiers Drive (assets DAM) dans la CORBEILLE (trashed),
// PAS de suppression définitive — récupérable ~30 j depuis Drive. Appelé quand un
// produit est supprimé, pour ses images centralisées qui ne servent plus ailleurs.
// Jeton OAuth serveur de l'utilisateur (scope drive complet).
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const MAX_IDS = 200

export const damDelete = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { fileIds } = (request.data ?? {}) as { fileIds?: unknown }
    if (!Array.isArray(fileIds) || fileIds.length === 0) return { trashed: 0 }

    const ids = Array.from(
      new Set(fileIds.filter((x): x is string => typeof x === 'string' && /^[\w-]{10,}$/.test(x))),
    ).slice(0, MAX_IDS)
    if (ids.length === 0) return { trashed: 0 }

    const token = await getGoogleAccessToken(request.auth.uid)
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          // 404/403 (déjà supprimé / hors scope app) → on ignore silencieusement.
          const res = await fetch(`${DRIVE_API}/files/${id}?fields=id`, {
            method: 'PATCH', headers: auth, body: JSON.stringify({ trashed: true }),
          })
          return res.ok
        } catch {
          return false
        }
      }),
    )
    return { trashed: results.filter(Boolean).length }
  },
)
