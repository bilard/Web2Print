type Bbox = { x: number; y: number; w: number; h: number }

/**
 * Échantillonne la couleur moyenne d'une couronne autour de la bbox dans
 * l'image décodée. Sample en dehors de la bbox (jamais dedans) pour ne pas
 * capturer le texte/objet overlayé. Retourne une string CSS hex (#rrggbb).
 *
 * Paramètres :
 *  - img : HTMLImageElement décodée (naturalWidth/Height définis)
 *  - bbox : zone en POURCENTAGES (0-100) de l'image
 *
 * Implementation :
 *  - convertit la bbox en pixels source
 *  - définit une couronne externe de padding `ringPx` autour de la bbox,
 *    clampée aux bornes de l'image
 *  - sample N points uniformément dans la couronne, moyenne RGB
 */
export function sampleAvgColorAroundBbox(
  img: HTMLImageElement,
  bbox: Bbox,
  options: { ringPx?: number; samplesPerSide?: number } = {}
): string {
  const ringPx = options.ringPx ?? 6
  const samplesPerSide = options.samplesPerSide ?? 8

  const W = img.naturalWidth || img.width
  const H = img.naturalHeight || img.height

  const bx = clamp(0, W, (bbox.x / 100) * W)
  const by = clamp(0, H, (bbox.y / 100) * H)
  const bw = clamp(0, W - bx, (bbox.w / 100) * W)
  const bh = clamp(0, H - by, (bbox.h / 100) * H)

  // Dans les tests jsdom, on injecte le canvas source via __testCanvas pour
  // contourner le fait que jsdom ne décode pas vraiment l'image src=data:.
  const sourceCanvas =
    (img as unknown as { __testCanvas?: HTMLCanvasElement }).__testCanvas ??
    drawImageToCanvas(img, W, H)
  const ctx = sourceCanvas.getContext('2d')
  if (!ctx) return '#ffffff'

  const points: Array<[number, number]> = []
  // Top edge (juste au-dessus de la bbox)
  for (let i = 0; i < samplesPerSide; i++) {
    const fx = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + fx * bw, by - ringPx])
  }
  // Bottom edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fx = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + fx * bw, by + bh + ringPx])
  }
  // Left edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fy = i / Math.max(1, samplesPerSide - 1)
    points.push([bx - ringPx, by + fy * bh])
  }
  // Right edge
  for (let i = 0; i < samplesPerSide; i++) {
    const fy = i / Math.max(1, samplesPerSide - 1)
    points.push([bx + bw + ringPx, by + fy * bh])
  }

  let r = 0, g = 0, b = 0, n = 0
  for (const [px, py] of points) {
    const cx = clamp(0, W - 1, Math.round(px))
    const cy = clamp(0, H - 1, Math.round(py))
    const data = ctx.getImageData(cx, cy, 1, 1).data
    r += data[0]
    g += data[1]
    b += data[2]
    n++
  }
  if (n === 0) return '#ffffff'
  return rgbToHex(Math.round(r / n), Math.round(g / n), Math.round(b / n))
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v))
}

function drawImageToCanvas(img: HTMLImageElement, W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (ctx) ctx.drawImage(img, 0, 0)
  return c
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
