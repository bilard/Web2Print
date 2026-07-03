// src/features/dam/uploadImageToDam.ts
// Pont GÉNÉRIQUE d'upload d'une image vers le DAM (Google Drive) : damUpload
// (serveur) récupère une URL, pas un blob → dépôt des octets en Storage temp,
// downloadURL re-téléchargé par la CF (validation magic-bytes) puis nettoyage.
// Sous-dossier au choix (« Promo Retail », « Détourés »…), id de dossier caché.
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { auth, storage, functions } from '@/lib/firebase/config'

const DAM_FOLDER_NAME = 'Web2Print — Assets DAM'

const damEnsureFolder = httpsCallable<{ folderName: string; subFolder?: string }, { rootId: string; targetId: string }>(functions, 'damEnsureFolder')
const damUpload = httpsCallable<{ url: string; fileName: string; folderId: string }, { fileId: string; webViewLink: string }>(functions, 'damUpload')

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
 * Uploade une image (data:/blob:/http) vers le sous-dossier DAM donné et renvoie
 * son webViewLink Drive (reconnu par isDriveImageRef → résoluble à l'affichage).
 */
export async function uploadImageToDam(src: string, fileName: string, subFolder: string): Promise<string> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Connexion requise.')
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
