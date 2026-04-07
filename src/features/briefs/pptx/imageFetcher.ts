/**
 * Télécharge une image depuis une URL et retourne une data URL base64
 * (format accepté par PptxGenJS via `addImage({ data })`).
 *
 * Nécessite que le bucket Firebase Storage autorise CORS sur l'origin de l'app.
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Téléchargement image ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('FileReader: résultat inattendu'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader: erreur'))
    reader.readAsDataURL(blob)
  })
}
