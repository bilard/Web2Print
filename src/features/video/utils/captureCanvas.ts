import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'

const DEFAULT_MULTIPLIER = 2

export interface CaptureResult {
  url: string
  storagePath: string
  width: number
  height: number
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, payload] = dataUrl.split(',', 2)
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] ?? 'image/png'
  const bin = atob(payload)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function captureCurrentPagePng(): Promise<CaptureResult> {
  const canvas = globalFabricCanvas
  if (!canvas) throw new Error('Canvas non disponible')

  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté')

  const dataUrl = canvas.toDataURL({
    multiplier: DEFAULT_MULTIPLIER,
    format: 'png',
    quality: 1,
  } as Parameters<typeof canvas.toDataURL>[0])

  const blob = dataUrlToBlob(dataUrl)
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
  const storagePath = `video-captures/${user.uid}/${fileName}`

  const ref = storageRef(storage, storagePath)
  await uploadBytes(ref, blob, {
    contentType: 'image/png',
    cacheControl: 'private, max-age=3600',
  })
  const url = await getDownloadURL(ref)

  return {
    url,
    storagePath,
    width: canvas.getWidth() * DEFAULT_MULTIPLIER,
    height: canvas.getHeight() * DEFAULT_MULTIPLIER,
  }
}
