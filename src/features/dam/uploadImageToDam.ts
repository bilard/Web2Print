// Pont GÉNÉRIQUE d'upload d'une image vers le DAM (Google Drive) : damUpload
// (serveur) récupère une URL, pas un blob → dépôt des octets en Storage temp,
// downloadURL re-téléchargé par la CF (validation magic-bytes) puis nettoyage.
// Sous-dossier au choix (« Promo Retail », « Détourés »…), id de dossier caché.
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { auth, storage, functions } from '@/lib/firebase/config'
import { t } from '@/lib/i18n'

const DAM_FOLDER_NAME = 'Web2Print — Assets DAM'

const damEnsureFolder = httpsCallable<{ folderName: string; subFolder?: string }, { rootId: string; targetId: string }>(functions, 'damEnsureFolder')
const damUpload = httpsCallable<
  { url: string; fileName: string; folderId: string; reuseByName?: boolean },
  { fileId: string; webViewLink: string; reused?: boolean }
>(functions, 'damUpload')

const folderCache = new Map<string, string>()

async function ensureFolder(subFolder: string): Promise<string> {
  const cached = folderCache.get(subFolder)
  if (cached) return cached
  const { targetId } = (await damEnsureFolder({ folderName: DAM_FOLDER_NAME, subFolder })).data
  folderCache.set(subFolder, targetId)
  return targetId
}

export const damSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'image'

/**
 * Uploade une image déjà accessible en http(s) (ex. URL CDN Higgsfield) vers le
 * sous-dossier DAM : `damUpload` la re-télécharge côté serveur (magic bytes, 20 Mo max).
 * Repli : certains CDN (Akamai — media.castorama) bloquent les IP datacenter
 * (« source répond 403 ») tout en servant CORS `*` — dans ce cas le NAVIGATEUR
 * télécharge (IP résidentielle) et passe par le pont Storage-temp
 * (`uploadImageToDam`). Renvoie le webViewLink Drive.
 */
/** Échec SYSTÉMIQUE (quota démo, Google non connecté) : le pont navigateur échouerait pareil. */
export function isSystemicDamError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? ''
  const msg = e instanceof Error ? e.message : String(e)
  // ⚠ le code Firebase (`functions/resource-exhausted`) n'apparaît PAS dans
  // message (qui porte le texte français « Limite démo atteinte… ») : tester les deux.
  return /resource-exhausted/i.test(code) || /limite démo|google non connect/i.test(msg)
}

export async function uploadUrlToDam(
  url: string,
  fileName: string,
  subFolder: string,
  opts?: { reuseByName?: boolean },
): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error(t('err.auth.required'))
  // Entités HTML résiduelles (URLs sorties de JSON-LD : `?a=1&amp;b=2`) —
  // laissées telles quelles, le CDN reçoit un paramètre `amp;b` erroné.
  const cleanUrl = url.replace(/&amp;/g, '&')
  const folderId = await ensureFolder(subFolder)
  try {
    const { webViewLink } = (await damUpload({ url: cleanUrl, fileName, folderId, reuseByName: opts?.reuseByName })).data
    return webViewLink
  } catch (e) {
    if (isSystemicDamError(e)) throw e
    try {
      return await uploadImageToDam(cleanUrl, fileName, subFolder)
    } catch (e2) {
      // Les DEUX voies ont échoué : message combiné, sinon impossible de
      // savoir si le pont navigateur a seulement tourné.
      const msg = e instanceof Error ? e.message : String(e)
      const msg2 = e2 instanceof Error ? e2.message : String(e2)
      throw new Error(t('err.dam.uploadBridge', { message: msg, bridge: msg2 }), { cause: e2 })
    }
  }
}

/**
 * Uploade une image (data:/blob:/http) vers le sous-dossier DAM donné et renvoie
 * son webViewLink Drive (reconnu par isDriveImageRef → résoluble à l'affichage).
 */
export async function uploadImageToDam(src: string, fileName: string, subFolder: string): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error(t('err.auth.required'))
  const blob = await (await fetch(src)).blob()
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png'
  const tempPath = `users/${uid}/dam-temp/${crypto.randomUUID()}.${ext}`
  const tempRef = storageRef(storage, tempPath)
  try {
    await uploadBytes(tempRef, blob, { contentType: blob.type || `image/${ext}` })
    const url = await getDownloadURL(tempRef)
    const folderId = await ensureFolder(subFolder)
    const name = fileName.includes('.') ? fileName : `${fileName}.${ext}`
    const { webViewLink } = (await damUpload({ url, fileName: name, folderId })).data
    return webViewLink
  } finally {
    void deleteObject(tempRef).catch(() => {})
  }
}
