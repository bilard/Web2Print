// functions/src/dam/damTrashByName.ts
// Callable : corbeille des assets DAM par EMPLACEMENT + NOM, indépendamment du
// contenu des cellules (robuste : marche même si les liens Drive ne sont pas
// persistés dans la feuille). Deux modes :
//   - namePrefix fourni → corbeille les fichiers du sous-dossier <scrape> dont le
//     nom commence par `<namePrefix>_` (= les images d'UN produit ; nommage upload
//     `<produit>_<cellIdx>_<tokenIdx>.<ext>`) ;
//   - sans namePrefix → corbeille le SOUS-DOSSIER entier (= tout un scraping).
// Refuse de toucher la racine DAM. Jeton OAuth serveur de l'utilisateur.
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getGoogleAccessToken } from '../google/serverAuth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

function escq(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findFolder(token: string, name: string, parentId?: string): Promise<string | null> {
  let q = `name='${escq(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`
  if (parentId) q += ` and '${parentId}' in parents`
  const params = new URLSearchParams({ q, fields: 'files(id)', orderBy: 'createdTime', pageSize: '1', spaces: 'drive' })
  const res = await fetch(`${DRIVE_API}/files?${params}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return null
  const d = (await res.json()) as { files?: { id: string }[] }
  return d.files?.[0]?.id ?? null
}

async function trashOne(token: string, id: string): Promise<boolean> {
  try {
    const res = await fetch(`${DRIVE_API}/files/${id}?fields=id`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    })
    return res.ok
  } catch {
    return false
  }
}

export const damTrashByName = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentification requise')
    const { folderName, subFolder, namePrefix } = (request.data ?? {}) as
      { folderName?: string; subFolder?: string; namePrefix?: string }

    const token = await getGoogleAccessToken(request.auth.uid)
    const rootId = await findFolder(token, (typeof folderName === 'string' && folderName) || 'Web2Print — Assets DAM')
    if (!rootId) return { trashed: 0 }
    const sub = typeof subFolder === 'string' ? subFolder.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 100) : ''
    const subId = sub ? await findFolder(token, sub, rootId) : rootId
    if (!subId) return { trashed: 0 }

    const prefix = typeof namePrefix === 'string'
      ? namePrefix.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 80)
      : ''

    // Sans préfixe → corbeille le sous-dossier entier (jamais la racine DAM).
    if (!prefix) {
      if (subId === rootId) return { trashed: 0 }
      return { trashed: (await trashOne(token, subId)) ? 1 : 0 }
    }

    // Avec préfixe → fichiers du sous-dossier dont le nom commence par `<prefix>_`.
    const params = new URLSearchParams({
      q: `'${subId}' in parents and trashed=false and name contains '${escq(prefix)}'`,
      fields: 'files(id,name)', pageSize: '200', spaces: 'drive',
    })
    const list = await fetch(`${DRIVE_API}/files?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!list.ok) return { trashed: 0 }
    const files = ((await list.json()) as { files?: { id: string; name: string }[] }).files ?? []
    const matching = files.filter((f) => f.name.startsWith(`${prefix}_`) || f.name === prefix)
    const results = await Promise.all(matching.map((f) => trashOne(token, f.id)))
    return { trashed: results.filter(Boolean).length }
  },
)
