// functions/src/dam/damMove.ts
// Callable : range des assets DAM déjà dans Drive sous le sous-dossier au nom du
// scraping (« Web2Print — Assets DAM / <scrape> »). Déplacement = update parents
// (addParents sous-dossier, removeParents racine). Idempotent. Les ids de dossier
// peuvent être pré-résolus (via damEnsureFolder) pour éviter toute (re)résolution.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'
import { ensureDamTarget } from './driveFolders'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const MAX_IDS = 200

export const damMove = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { fileIds, folderName, subFolder, rootId: preRoot, targetId: preTarget } = (request.data ?? {}) as
      { fileIds?: unknown; folderName?: string; subFolder?: string; rootId?: string; targetId?: string }
    if (!Array.isArray(fileIds) || fileIds.length === 0) return { moved: 0 }

    const ids = Array.from(
      new Set(fileIds.filter((x): x is string => typeof x === 'string' && /^[\w-]{10,}$/.test(x))),
    ).slice(0, MAX_IDS)
    if (ids.length === 0) return { moved: 0 }

    const token = await getGoogleAccessToken(request.auth.uid)
    let rootId = typeof preRoot === 'string' ? preRoot : ''
    let targetId = typeof preTarget === 'string' ? preTarget : ''
    if (!rootId || !targetId) {
      const sub = typeof subFolder === 'string' ? subFolder.trim() : ''
      if (!sub) return { moved: 0 } // pas de sous-dossier cible → rien à ranger
      const resolved = await ensureDamTarget(token, folderName ?? 'Web2Print — Assets DAM', sub)
      rootId = resolved.rootId
      targetId = resolved.targetId
    }
    if (targetId === rootId) return { moved: 0 } // pas de sous-dossier → rien à déplacer

    const auth = { Authorization: `Bearer ${token}` }
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          // Lit les parents ACTUELS (le fichier peut être à la racine OU dans un
          // doublon créé par une ancienne course) et les remplace par le sous-dossier.
          const meta = (await fetch(`${DRIVE_API}/files/${id}?fields=parents`, { headers: auth })
            .then((r) => (r.ok ? r.json() : null))) as { parents?: string[] } | null
          const parents = meta?.parents ?? []
          if (parents.includes(targetId)) return true // déjà au bon endroit
          const params = new URLSearchParams({ addParents: targetId, fields: 'id' })
          if (parents.length > 0) params.set('removeParents', parents.join(','))
          const res = await fetch(`${DRIVE_API}/files/${id}?${params}`, { method: 'PATCH', headers: auth })
          return res.ok
        } catch {
          return false
        }
      }),
    )
    return { moved: results.filter(Boolean).length }
  },
)
