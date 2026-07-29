// Résolution d'une cellule image PIM (Drive webViewLink privé OU URL externe sans
// CORS) vers une URL affichable ET capturable par html2canvas (blob:/data: same-origin).
// Réplique le pattern `resolveImg` de features/retail-promo/steps/StepRender.tsx :
// Drive → blob authentifié (resolveDriveImageUrl) ; sinon → callable `imageProxy`
// (contourne CORS) → data-URI. AUCUN cache : la fraîcheur des visuels prime.
import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'
import { imageChainCandidates, isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from '@/features/dam/driveAssets'

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')
// ⚠ AUCUN CACHE de résolution. Un visuel régénéré côté Données réutilise le même
// fichier Drive (même URL) : tout cache servait éternellement l'ancienne image —
// le PIM montrait le nouveau visuel, le catalogue l'ancien. La fraîcheur prime
// sur l'économie d'appels ; seuls les ÉCHECS sont mémorisés, le temps du montage,
// pour ne pas marteler le proxy ni inonder la console.
const failedOnce = new Set<string>()

function isReady(url: string): boolean {
  return url.startsWith('data:') || url.startsWith('blob:')
}

/** Essaie chaque candidat de la chaîne jusqu'au premier qui se résout (repli). */
export async function resolveCatalogImage(value: string): Promise<string | undefined> {
  for (const candidate of imageChainCandidates(value)) {
    const resolved = await resolveOne(candidate)
    if (resolved) return resolved
  }
  return undefined
}

async function resolveOne(url: string): Promise<string | undefined> {
  if (isReady(url)) return url
  if (failedOnce.has(url)) return undefined
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
    return resolved
  } catch (e) {
    // Échec loggé UNE fois par URL : un placeholder silencieux rendrait le
    // diagnostic impossible en production.
    console.warn('[catalog] résolution image échouée :', url, e)
    failedOnce.add(url)
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
  const first = url ? imageChainCandidates(url)[0] : undefined
  const initialReady = !!first && isReady(first)
  const [src, setSrc] = useState<string | undefined>(initialReady ? (url as string) : undefined)
  const [resolving, setResolving] = useState(!!url && !initialReady)

  useEffect(() => {
    if (!url) { setSrc(undefined); setResolving(false); return }
    const head = imageChainCandidates(url)[0]
    if (head && isReady(head)) { setSrc(head); setResolving(false); return }
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
