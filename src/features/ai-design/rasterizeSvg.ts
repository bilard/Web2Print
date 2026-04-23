/**
 * Rasterise un SVG (string) vers un PNG data URI, via un canvas 2D.
 *
 * Utilisé par le Vision Critic pour comparer le rendu SVG à la référence
 * Nano Banana en ayant deux images dans la même modalité (PNG vs PNG).
 *
 * Le SVG est wrappé en Blob, chargé via <img>, puis dessiné sur un canvas
 * aux dimensions cibles. Pour garantir un pixel-match avec la référence
 * (et donc un diff vision utile), on force un fond blanc sous le rendu si
 * le SVG n'a pas de background (sécurité).
 */

interface RasterizeArgs {
  svg: string
  /** Largeur cible en pixels. Idéalement même ratio que la ref Nano Banana. */
  widthPx: number
  /** Hauteur cible en pixels. */
  heightPx: number
  /** Si true, ajoute un fond blanc derrière le SVG (sécurité). Default: true. */
  whiteBackdrop?: boolean
  /** Quality JPEG ou null pour PNG. Default: PNG (null). */
  jpegQuality?: number | null
}

export async function rasterizeSvgToDataUri(args: RasterizeArgs): Promise<string> {
  const { svg, widthPx, heightPx, whiteBackdrop = true, jpegQuality = null } = args

  // Certains parseurs SVG se plaignent sans xmlns explicite — on le rajoute si
  // absent dans le <svg> racine.
  const patchedSvg = svg.includes('xmlns="http://www.w3.org/2000/svg"')
    ? svg
    : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')

  const blob = new Blob([patchedSvg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('SVG illisible par <img>'))
      el.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = widthPx
    canvas.height = heightPx
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context indisponible')

    if (whiteBackdrop) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, widthPx, heightPx)
    }

    ctx.drawImage(img, 0, 0, widthPx, heightPx)

    if (jpegQuality != null) {
      return canvas.toDataURL('image/jpeg', jpegQuality)
    }
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Variante réduite pour le Vision Critic : max 1024px sur le grand côté
 * (limite multimodale Claude, PNG lourd sinon).
 */
export async function rasterizeSvgForCritic(svg: string, widthMm: number, heightMm: number): Promise<string> {
  const MAX_SIDE = 1024
  const ratio = widthMm / heightMm
  let w: number
  let h: number
  if (widthMm >= heightMm) {
    w = MAX_SIDE
    h = Math.round(MAX_SIDE / ratio)
  } else {
    h = MAX_SIDE
    w = Math.round(MAX_SIDE * ratio)
  }
  // JPEG q=0.85 : ~4-5× plus léger que PNG, Claude Vision s'en sort très bien
  return rasterizeSvgToDataUri({ svg, widthPx: w, heightPx: h, jpegQuality: 0.85 })
}
