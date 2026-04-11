/**
 * Télécharge une image depuis une URL et retourne une data URL base64
 * (format accepté par PptxGenJS via `addImage({ data })`).
 *
 * Nécessite que le bucket Firebase Storage autorise CORS sur l'origin de l'app.
 */
export interface FetchedImage {
  data: string
  /** Dimensions naturelles en pixels (pour calculer un fit ratio-safe). */
  naturalWidth: number
  naturalHeight: number
}

async function fetchImageAsBase64(url: string): Promise<string> {
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

/**
 * Télécharge une image ET mesure ses dimensions naturelles (pour préserver le
 * ratio dans PPTX sans dépendre du `sizing` de PptxGenJS qui est peu fiable).
 */
export async function fetchImageWithDimensions(url: string): Promise<FetchedImage> {
  const data = await fetchImageAsBase64(url)
  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('Image natural size inconnue'))
    img.src = data
  })
  return { data, naturalWidth: dims.w, naturalHeight: dims.h }
}

/**
 * Calcule les coordonnées d'une image pour qu'elle tienne dans une boîte
 * en préservant son ratio (lettrebox centré).
 */
export function fitContain(
  natW: number,
  natH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  if (!natW || !natH) {
    return { x: boxX, y: boxY, w: boxW, h: boxH }
  }
  const scale = Math.min(boxW / natW, boxH / natH)
  const w = natW * scale
  const h = natH * scale
  const x = boxX + (boxW - w) / 2
  const y = boxY + (boxH - h) / 2
  return { x, y, w, h }
}
