// src/features/catalog/useResolvedImage.ts
// Résolution d'une cellule image PIM (Drive webViewLink privé OU URL externe sans
// CORS) vers une URL affichable ET capturable par html2canvas (blob:/data: same-origin).
// Réplique le pattern `resolveImg` de features/retail-promo/steps/StepRender.tsx :
// Drive → blob authentifié (resolveDriveImageUrl) ; sinon → callable `imageProxy`
// (contourne CORS) → data-URI. Cache module par URL (résolue une seule fois/session).
import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from '@/features/dam/driveAssets'

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')
// Cache module : une URL résolue une seule fois (data-URI/blob, ou null si échec).
const imgCache = new Map<string, string | null>()

function isReady(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('blob:')
}

async function resolveCatalogImage(url: string): Promise<string | undefined> {
  if (isReady(url)) return url
  if (imgCache.has(url)) return imgCache.get(url) ?? undefined
  try {
    let resolved: string
    if (isDriveImageRef(url)) {
      // Asset DAM (Google Drive privé) → blob: same-origin, capturable par html2canvas.
      const fileId = extractDriveFileId(url)
      if (!fileId) throw new Error('fileId Drive introuvable')
      resolved = await resolveDriveImageUrl(fileId)
    } else {
      // URL externe http(s) → proxy serveur (contourne CORS) → data-URI.
      const { data } = await imageProxyFn({ url })
      resolved = `data:${data.mimeType};base64,${data.data}`
    }
    imgCache.set(url, resolved)
    return resolved
  } catch {
    imgCache.set(url, null)
    return undefined
  }
}

export interface ResolvedImage {
  /** URL affichable (blob:/data:) une fois résolue ; undefined pendant la résolution ou en échec. */
  src: string | undefined
  /** Vrai tant que la résolution async est en cours (permet à l'export d'attendre). */
  resolving: boolean
}

/** Résout une cellule image (Drive/CORS) en URL affichable, avec cache module. */
export function useResolvedImage(url: string | undefined | null): ResolvedImage {
  const initialReady = !!url && isReady(url)
  const [src, setSrc] = useState<string | undefined>(initialReady ? (url as string) : undefined)
  const [resolving, setResolving] = useState(!!url && !initialReady)

  useEffect(() => {
    if (!url) { setSrc(undefined); setResolving(false); return }
    if (isReady(url)) { setSrc(url); setResolving(false); return }
    let cancelled = false
    setResolving(true)
    setSrc(undefined)
    void resolveCatalogImage(url).then((u) => {
      if (cancelled) return
      setSrc(u)
      setResolving(false)
    })
    return () => { cancelled = true }
  }, [url])

  return { src, resolving }
}
