// functions/src/dam/damDelete.ts
// Callable : opère sur des fichiers Drive (assets DAM) selon `op` :
//   - 'trash' (défaut) → corbeille (trashed=true), récupérable ~30 j ;
//   - 'restore'        → sort de la corbeille (trashed=false) ;
//   - 'delete'         → suppression DÉFINITIVE (DELETE) — irréversible.
// Jeton OAuth serveur de l'utilisateur (scope drive complet).
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const MAX_IDS = 200

type Op = 'trash' | 'restore' | 'delete'

export const damDelete = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { fileIds, op } = (request.data ?? {}) as { fileIds?: unknown; op?: unknown }
    if (!Array.isArray(fileIds) || fileIds.length === 0) return { trashed: 0 }
    const operation: Op = op === 'restore' || op === 'delete' ? op : 'trash'

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
          const res =
            operation === 'delete'
              ? await fetch(`${DRIVE_API}/files/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
              : await fetch(`${DRIVE_API}/files/${id}?fields=id`, {
                  method: 'PATCH', headers: auth, body: JSON.stringify({ trashed: operation === 'trash' }),
                })
          // DELETE renvoie 204 No Content.
          return res.ok || res.status === 204
        } catch {
          return false
        }
      }),
    )
    return { trashed: results.filter(Boolean).length }
  },
)
