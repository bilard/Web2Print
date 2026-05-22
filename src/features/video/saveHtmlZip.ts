import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'
import type { Composition } from './promptToComposition'

export interface SaveHtmlZipInput {
  /** Identifiant local de l'animation, généré par useGenerateVideo. */
  animationId: string
  blob: Blob
  aspect: AspectFormat
  composition?: Composition
  styleConfig?: StyleConfig
  caption?: string
  brand?: string
  prompt?: string
  width?: number
  height?: number
  ownerId: string
}

export interface SaveHtmlZipResult {
  url: string
  storagePath: string
  bytes: number
}

/** Upload le ZIP HTML dans Firebase Storage (`dam/html-animations/{uid}/...`)
 *  et sauve un doc Firestore (`animations/{animationId}`) avec les metadata
 *  utiles pour la bibliothèque DAM. */
export async function saveHtmlZip(input: SaveHtmlZipInput): Promise<SaveHtmlZipResult> {
  const storagePath = `dam/html-animations/${input.ownerId}/${input.animationId}.zip`
  const ref = storageRef(storage, storagePath)
  await uploadBytes(ref, input.blob, {
    contentType: 'application/zip',
    cacheControl: 'private, max-age=31536000',
  })
  const url = await getDownloadURL(ref)

  await setDoc(doc(db, 'animations', input.animationId), {
    animationId: input.animationId,
    ownerId: input.ownerId,
    url,
    storagePath,
    bytes: input.blob.size,
    aspect: input.aspect,
    composition: input.composition ?? null,
    styleConfig: input.styleConfig ?? null,
    caption: input.caption ?? null,
    brand: input.brand ?? null,
    prompt: input.prompt ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    createdAt: serverTimestamp(),
  })

  return { url, storagePath, bytes: input.blob.size }
}
