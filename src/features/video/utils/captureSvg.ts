import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { generateCurrentPageSvg } from '@/features/export/useExportSvg'

export interface SvgCaptureResult {
  url: string
  storagePath: string
  bytes: number
  width: number
  height: number
  svg: string
}

export async function uploadSvgToStorage(
  svg: string,
  width: number,
  height: number,
): Promise<SvgCaptureResult> {
  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté')

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`
  const storagePath = `video-captures/${user.uid}/${fileName}`

  const ref = storageRef(storage, storagePath)
  await uploadBytes(ref, blob, {
    contentType: 'image/svg+xml',
    cacheControl: 'private, max-age=3600',
  })
  const url = await getDownloadURL(ref)

  return {
    url,
    storagePath,
    bytes: blob.size,
    width,
    height,
    svg,
  }
}

export async function captureCurrentPageSvg(): Promise<SvgCaptureResult> {
  // `cropToContent: true` ⇒ le SVG est cadré sur la bounding box du design réel
  // (sans padding), pas sur la surface canvas. Sinon les designs centrés dans
  // un canvas plus grand que le contenu (cas IDML/PDF avec marges natives)
  // produisent un MP4 majoritairement vide avec une petite vignette au centre.
  const result = await generateCurrentPageSvg({ cropToContent: true })
  if (!result) throw new Error('Canvas non disponible')
  return uploadSvgToStorage(result.svg, result.width, result.height)
}
