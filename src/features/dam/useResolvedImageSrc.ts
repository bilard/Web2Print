// Résout une valeur image affichable : si c'est une référence Google Drive (DAM),
// télécharge les octets authentifiés → blob URL (mémoïsé) ; sinon renvoie la valeur
// telle quelle. À utiliser partout où l'on rend `<img src>` d'une donnée produit
// (galeries, lightbox) pour que les images centralisées dans le DAM s'affichent.
import { useState, useEffect } from 'react'
import { imageChainCandidates, isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from './driveAssets'

/** Premier candidat résoluble de la chaîne (« détourée | originale ») — repli naturel. */
async function resolveChain(value: string): Promise<string> {
  for (const candidate of imageChainCandidates(value)) {
    if (!isDriveImageRef(candidate)) return candidate
    const fileId = extractDriveFileId(candidate)
    if (!fileId) continue
    try { return await resolveDriveImageUrl(fileId) } catch { /* candidat suivant */ }
  }
  return ''
}

/** Renvoie une URL directement utilisable comme `src` (vide pendant la résolution Drive). */
export function useResolvedImageSrc(value: string): string {
  const first = imageChainCandidates(value)[0]
  const [src, setSrc] = useState(() => (first && !isDriveImageRef(first) ? first : ''))

  useEffect(() => {
    let cancelled = false
    const head = imageChainCandidates(value)[0]
    if (head && !isDriveImageRef(head)) { setSrc(head); return }
    setSrc('')
    void resolveChain(value).then((url) => { if (!cancelled) setSrc(url) })
    return () => { cancelled = true }
  }, [value])

  return src
}
