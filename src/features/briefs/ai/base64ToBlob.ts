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
