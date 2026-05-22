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
  // cropToContent=false : on garde le viewBox = canvas Fabric ENTIER, ce qui
  // préserve la marge blanche naturelle autour du contenu du projet. C'est
  // ce que l'utilisateur attend (l'animation montre le projet tel quel,
  // marge incluse, comme dans l'éditeur — pas cadré au contenu).
  // `embedFonts` : embed les fonts custom en `@font-face` base64.
  const result = await generateCurrentPageSvg({ cropToContent: false, embedFonts: true })
  if (!result) throw new Error('Canvas non disponible')
  return uploadSvgToStorage(result.svg, result.width, result.height)
}
