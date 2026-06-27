// functions/src/dam/damMove.ts
// Callable : range des assets DAM déjà dans Drive sous le sous-dossier au nom du
// scraping (« Web2Print — Assets DAM / <scrape> »). Sert à organiser les images
// centralisées AVANT l'introduction des sous-dossiers (elles sont à la racine).
// Déplacement = update parents (addParents sous-dossier, removeParents racine).
// Jeton OAuth serveur de l'utilisateur (scope drive complet).
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MAX_IDS = 200

async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` }
  const esc = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  let q = `name='${esc}' and mimeType='${FOLDER_MIME}' and trashed=false`
  if (parentId) q += ` and '${parentId}' in parents`
  const params = new URLSearchParams({ q, fields: 'files(id)', orderBy: 'modifiedTime desc', pageSize: '1', spaces: 'drive' })
  const find = await fetch(`${DRIVE_API}/files?${params}`, { headers: auth })
  if (find.ok) {
    const d = (await find.json()) as { files?: { id: string }[] }
    if (d.files?.[0]?.id) return d.files[0].id
  }
  const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME }
  if (parentId) metadata.parents = [parentId]
  const create = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(metadata),
  })
  const j = (await create.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!create.ok || !j?.id) throw new HttpsError('internal', `dossier DAM : ${create.status} ${j?.error?.message ?? ''}`)
  return j.id
}

export const damMove = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { fileIds, folderName, subFolder } = (request.data ?? {}) as
      { fileIds?: unknown; folderName?: string; subFolder?: string }
    if (!Array.isArray(fileIds) || fileIds.length === 0) return { moved: 0 }
    const sub = typeof subFolder === 'string' ? subFolder.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 100) : ''
    if (!sub) return { moved: 0 } // pas de sous-dossier cible → rien à ranger

    const ids = Array.from(
      new Set(fileIds.filter((x): x is string => typeof x === 'string' && /^[\w-]{10,}$/.test(x))),
    ).slice(0, MAX_IDS)
    if (ids.length === 0) return { moved: 0 }

    const token = await getGoogleAccessToken(request.auth.uid)
    const rootId = await ensureFolder(token, (typeof folderName === 'string' && folderName) || 'Web2Print — Assets DAM')
    const subId = await ensureFolder(token, sub, rootId)

    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          // addParents(sous-dossier) + removeParents(racine) : idempotent (Drive
          // ignore un removeParents que le fichier n'a pas, et un fichier déjà
          // dans le sous-dossier reste inchangé).
          const params = new URLSearchParams({ addParents: subId, removeParents: rootId, fields: 'id' })
          const res = await fetch(`${DRIVE_API}/files/${id}?${params}`, {
            method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
          })
          return res.ok
        } catch {
          return false
        }
      }),
    )
    return { moved: results.filter(Boolean).length }
  },
)
