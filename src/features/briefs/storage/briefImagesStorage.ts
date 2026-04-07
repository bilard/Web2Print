import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { mimeTypeToExtension } from '@/features/briefs/ai/base64ToBlob'

/**
 * Upload un Blob dans Firebase Storage à `briefs/{briefId}/images/{imageId}.{ext}`,
 * écrasant tout fichier précédent au même chemin (régénération = overwrite).
 * Retourne l'URL téléchargeable publique.
 */
export async function uploadBriefImage(
  briefId: string,
  imageId: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const ext = mimeTypeToExtension(mimeType)
  const path = `briefs/${briefId}/images/${imageId}.${ext}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, blob, { contentType: mimeType })
  return getDownloadURL(ref)
}
