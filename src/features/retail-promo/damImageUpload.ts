// Upload d'une image produit remplacée vers le DAM (Google Drive), pour ne stocker
// qu'une RÉFÉRENCE Drive (webViewLink) dans la fiche au lieu d'un data-URL lourd.
//
// Pont identique à useDamFolderUpload : damUpload (serveur) récupère une URL, pas
// un blob → on dépose les octets en Storage temp, on en obtient un downloadURL que
// la CF re-télécharge dans Drive, puis on supprime le fichier temporaire.
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { auth, storage, functions } from '@/lib/firebase/config'

const DAM_FOLDER_NAME = 'Web2Print — Assets DAM'
const SUB_FOLDER = 'Promo Retail'

const damEnsureFolder = httpsCallable<{ folderName: string; subFolder?: string }, { rootId: string; targetId: string }>(functions, 'damEnsureFolder')
const damUpload = httpsCallable<{ url: string; fileName: string; folderId: string }, { fileId: string; webViewLink: string }>(functions, 'damUpload')

let cachedFolderId: string | null = null
async function ensureFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId
  const { targetId } = (await damEnsureFolder({ folderName: DAM_FOLDER_NAME, subFolder: SUB_FOLDER })).data
  cachedFolderId = targetId
  return targetId
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'image'

/**
 * Uploade une image (data:/blob:/http) vers le DAM et renvoie son webViewLink Drive
 * (reconnu par isDriveImageRef → résoluble via resolveDriveImageUrl).
 */
export async function uploadPromoImageToDam(src: string, name: string): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Connexion requise.')
  const blob = await (await fetch(src)).blob()
  const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'png'
  const tempPath = `users/${uid}/dam-temp/${crypto.randomUUID()}.${ext}`
  const tempRef = storageRef(storage, tempPath)
  try {
    await uploadBytes(tempRef, blob, { contentType: blob.type || `image/${ext}` })
    const url = await getDownloadURL(tempRef)
    const folderId = await ensureFolder()
    const { webViewLink } = (await damUpload({ url, fileName: `${slug(name)}.${ext}`, folderId })).data
    return webViewLink
  } finally {
    void deleteObject(tempRef).catch(() => {})
  }
}
