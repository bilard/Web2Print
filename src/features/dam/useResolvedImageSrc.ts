// src/features/dam/useResolvedImageSrc.ts
// Résout une valeur image affichable : si c'est une référence Google Drive (DAM),
// télécharge les octets authentifiés → blob URL (mémoïsé) ; sinon renvoie la valeur
// telle quelle. À utiliser partout où l'on rend `<img src>` d'une donnée produit
// (galeries, lightbox) pour que les images centralisées dans le DAM s'affichent.
import { useState, useEffect } from 'react'
import { isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from './driveAssets'

/** Renvoie une URL directement utilisable comme `src` (vide pendant la résolution Drive). */
export function useResolvedImageSrc(value: string): string {
  const [src, setSrc] = useState(() => (isDriveImageRef(value) ? '' : value))

  useEffect(() => {
    let cancelled = false
    if (!isDriveImageRef(value)) {
      setSrc(value)
      return
    }
    const fileId = extractDriveFileId(value)
    if (!fileId) {
      setSrc('')
      return
    }
    setSrc('')
    resolveDriveImageUrl(fileId)
      .then((url) => { if (!cancelled) setSrc(url) })
      .catch(() => { if (!cancelled) setSrc('') })
    return () => { cancelled = true }
  }, [value])

  return src
}
