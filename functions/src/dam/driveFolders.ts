// functions/src/dam/driveFolders.ts
// Helper partagé : garantit l'existence d'un dossier Drive (idempotent),
// éventuellement sous un parent. Centralisé pour éviter la duplication entre
// damUpload / damMove / damEnsureFolder ET la divergence de logique.
import { HttpsError } from 'firebase-functions/v2/https'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` }
  const esc = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  let q = `name='${esc}' and mimeType='${FOLDER_MIME}' and trashed=false`
  if (parentId) q += ` and '${parentId}' in parents`
  const params = new URLSearchParams({ q, fields: 'files(id)', orderBy: 'createdTime', pageSize: '1', spaces: 'drive' })
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
  if (!create.ok || !j?.id) throw new HttpsError('internal', `dossier DAM Drive : ${create.status} ${j?.error?.message ?? ''}`)
  return j.id
}

/**
 * Résout le dossier cible du DAM : racine `folderName`, puis sous-dossier
 * `subFolder` (au nom du scraping) s'il est fourni. Renvoie les deux ids.
 * À appeler UNE FOIS avant des uploads concurrents (évite les dossiers en double).
 */
export async function ensureDamTarget(
  token: string,
  folderName: string,
  subFolder?: string,
): Promise<{ rootId: string; targetId: string }> {
  const rootId = await ensureFolder(token, folderName || 'Web2Print — Assets DAM')
  const sub = typeof subFolder === 'string' ? subFolder.replace(/[/\\:*?"<>|]/g, '_').trim().slice(0, 100) : ''
  const targetId = sub ? await ensureFolder(token, sub, rootId) : rootId
  return { rootId, targetId }
}
