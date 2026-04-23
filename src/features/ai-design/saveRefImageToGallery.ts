/**
 * Sauvegarde l'image de référence Nano Banana dans la galerie Firestore/Storage
 * du projet courant, pour que l'utilisateur puisse la comparer visuellement
 * avec le rendu SVG produit par la pipeline.
 *
 * Fire-and-forget : les erreurs sont loguées mais ne bloquent jamais la pipeline
 * de génération.
 */

import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, addDoc } from 'firebase/firestore'
import { storage, db } from '@/lib/firebase/config'
import type { GalleryImage } from '@/features/nanobana/types'

function dataUriToBlob(dataUri: string): { blob: Blob; mimeType: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Data URI invalide')
  const mimeType = match[1]
  const b64 = match[2]
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { blob: new Blob([bytes], { type: mimeType }), mimeType }
}

async function measureBlobImage(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image illisible'))
      el.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function blobToThumbnailJpeg(blob: Blob, maxSize = 240): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Image illisible'))
      el.src = url
    })
    const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1)
    const w = Math.max(1, Math.round(img.width * ratio))
    const h = Math.max(1, Math.round(img.height * ratio))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Thumbnail échoué'))), 'image/jpeg', 0.75)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface SaveRefImageArgs {
  dataUri: string
  projectId: string
  name: string
  tags?: string[]
}

export async function saveRefImageToGallery(args: SaveRefImageArgs): Promise<GalleryImage | null> {
  try {
    const { dataUri, projectId, name } = args
    const tags = Array.from(new Set(['nano-banana', 'design-ref', ...(args.tags ?? [])]))

    const { blob, mimeType } = dataUriToBlob(dataUri)
    const [dims, thumbBlob] = await Promise.all([measureBlobImage(blob), blobToThumbnailJpeg(blob)])

    const ts = Date.now()
    const rand = Math.random().toString(36).slice(2, 7)
    const ext = mimeType.includes('png') ? 'png' : 'jpg'

    const imgPath = `projects/${projectId}/gallery/${ts}_${rand}_ref.${ext}`
    const thumbPath = `projects/${projectId}/gallery/thumbs/${ts}_${rand}_ref_thumb.jpg`

    const [imgRef, thumbRef] = [ref(storage, imgPath), ref(storage, thumbPath)]
    await Promise.all([uploadBytes(imgRef, blob), uploadBytes(thumbRef, thumbBlob)])
    const [url, thumbnailUrl] = await Promise.all([getDownloadURL(imgRef), getDownloadURL(thumbRef)])

    const imageData: Omit<GalleryImage, 'id'> = {
      name,
      url,
      thumbnailUrl,
      storagePath: imgPath,
      width: dims.width,
      height: dims.height,
      sizeBytes: blob.size,
      compressedSizeBytes: blob.size,
      mimeType,
      createdAt: ts,
      tags,
    }

    const docRef = await addDoc(collection(db, `projects/${projectId}/gallery`), imageData)
    console.log('[Gallery] Nano Banana ref saved:', docRef.id, '→', name)
    return { id: docRef.id, ...imageData }
  } catch (err) {
    console.error('[Gallery] ✗ Failed to save Nano Banana ref:', err)
    return null
  }
}
