// Manipulation de binaires côté navigateur : décodage base64, téléchargement, taille
// lisible. Regroupés ici parce que chacun de ces helpers vivait en TROIS ou QUATRE
// copies dispersées dans `features/` — et qu'une copie ne reçoit pas les correctifs de
// l'autre. `base64ToBlob` en est l'illustration : la version des briefs sait retirer le
// préfixe `data:…;base64,`, les copies locales des nodes de workflow rendaient un blob
// corrompu sur la même entrée.

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

export function mimeTypeToExtension(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? 'png'
}

/**
 * Décode une chaîne base64 (avec ou sans préfixe data URL) en Blob binaire.
 * Throw si la chaîne n'est pas du base64 valide.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  let payload = base64
  const commaIdx = payload.indexOf(',')
  if (payload.startsWith('data:') && commaIdx !== -1) {
    payload = payload.slice(commaIdx + 1)
  }
  let binary: string
  try {
    binary = atob(payload)
  } catch {
    throw new Error('base64 invalide')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

/** Déclenche le téléchargement d'un blob sous un nom donné. L'URL objet est révoquée
 *  en différé : la révoquer tout de suite annule le téléchargement sur Safari. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Taille de fichier lisible (B / KB / MB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
