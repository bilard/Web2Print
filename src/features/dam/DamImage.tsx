// src/features/dam/DamImage.tsx
// Vignette image tolérante aux références Google Drive (DAM) : une valeur de cellule
// peut être une URL CDN directe OU un webViewLink Drive d'un asset PRIVÉ. Dans ce
// dernier cas on télécharge les octets authentifiés (blob: mémoïsé) avant d'afficher.
import { useState, useEffect } from 'react'
import { isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from './driveAssets'

interface Props {
  value: string
  className?: string
  alt?: string
}

export function DamImage({ value, className, alt = '' }: Props) {
  const [src, setSrc] = useState(() => (isDriveImageRef(value) ? '' : value))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    if (!isDriveImageRef(value)) {
      setSrc(value)
      return
    }
    const fileId = extractDriveFileId(value)
    if (!fileId) {
      setFailed(true)
      return
    }
    setSrc('')
    resolveDriveImageUrl(fileId)
      .then((url) => { if (!cancelled) setSrc(url) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [value])

  if (failed) return null
  // Placeholder neutre pendant la résolution Drive (évite l'icône « image cassée »).
  if (!src) return <div className={className} aria-hidden />
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
