/**
 * Gestion de la source IDML originale.
 * - Stocke en mémoire (session courante)
 * - Upload vers Firebase Storage (persistance)
 * - Download depuis Storage (sessions futures)
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'

interface IdmlSourceData {
  rawBuffer: ArrayBuffer
  fileName: string
  projectId: string | null
}

/** Singleton session — disponible immédiatement après import */
export let globalIdmlSource: IdmlSourceData | null = null

export function setGlobalIdmlSource(
  buffer: ArrayBuffer,
  fileName: string,
  projectId: string | null = null,
): void {
  globalIdmlSource = { rawBuffer: buffer.slice(0), fileName, projectId }
  console.log(`[IDML Source] Stocké en mémoire: "${fileName}" (${(buffer.byteLength / 1024).toFixed(1)} KB)`)
}

/** Upload le fichier IDML vers Firebase Storage pour persistance entre sessions */
export async function uploadIdmlToStorage(
  projectId: string,
  buffer: ArrayBuffer,
  fileName: string,
): Promise<string> {
  const idmlRef = ref(storage, `projects/${projectId}/source/${fileName}`)
  await uploadBytes(idmlRef, buffer)
  const url = await getDownloadURL(idmlRef)
  console.log(`[IDML Source] Uploadé vers Storage: projects/${projectId}/source/${fileName}`)
  return url
}

/** Télécharge le fichier IDML depuis Firebase Storage */
export async function downloadIdmlFromStorage(
  projectId: string,
  knownFileName?: string,
): Promise<ArrayBuffer | null> {
  try {
    const possibleNames = [
      knownFileName,
      globalIdmlSource?.fileName,
      'source.idml',
    ].filter(Boolean) as string[]

    // Dédupliquer
    const uniqueNames = [...new Set(possibleNames)]

    for (const name of uniqueNames) {
      try {
        const fileRef = ref(storage, `projects/${projectId}/source/${name}`)
        const url = await getDownloadURL(fileRef)
        const response = await fetch(url)
        if (response.ok) {
          const buffer = await response.arrayBuffer()
          console.log(`[IDML Source] Téléchargé depuis Storage: ${name} (${(buffer.byteLength / 1024).toFixed(1)} KB)`)
          // Restaurer le singleton en mémoire
          setGlobalIdmlSource(buffer, name, projectId)
          return buffer
        }
      } catch {
        // Ce nom n'existe pas, essayer le suivant
      }
    }

    console.warn('[IDML Source] Aucun fichier IDML trouvé dans Storage')
    return null
  } catch (err) {
    console.warn('[IDML Source] Erreur téléchargement Storage:', err)
    return null
  }
}

/**
 * Récupère le buffer IDML : d'abord en mémoire, sinon depuis Storage.
 */
export async function getIdmlBuffer(
  projectId: string | null,
  knownFileName?: string,
): Promise<ArrayBuffer | null> {
  const matchesKnownFile = !knownFileName || globalIdmlSource?.fileName === knownFileName

  if (
    globalIdmlSource &&
    matchesKnownFile &&
    (
      projectId == null ||
      globalIdmlSource.projectId === projectId
    )
  ) {
    return globalIdmlSource.rawBuffer
  }

  if (projectId) return downloadIdmlFromStorage(projectId, knownFileName)
  return null
}
