// Traits de coupe aux 4 coins, en mm, dans la marge de fond perdu.
// Page PDF = (w+2b) × (h+2b) ; zone rognée = (b,b)-(b+w,b+h). GAP entre trait et zone.
const GAP_MM = 1

export interface MarkCanvas {
  setDrawColor(r: number, g: number, b: number): void
  setLineWidth(w: number): void
  line(x1: number, y1: number, x2: number, y2: number): void
}

export function drawCropMarks(pdf: MarkCanvas, wMm: number, hMm: number, bleedMm: number): void {
  if (bleedMm <= GAP_MM) return
  const b = bleedMm
  const inner = b - GAP_MM // longueur utile du trait depuis le bord de page
  const W = wMm + 2 * b
  const H = hMm + 2 * b
  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.2)
  const corners: [number, number][] = [[b, b], [b + wMm, b], [b, b + hMm], [b + wMm, b + hMm]]
  for (const [x, y] of corners) {
    // Trait horizontal : vers le bord gauche ou droit.
    if (x === b) pdf.line(0, y, inner, y)
    else pdf.line(W - inner, y, W, y)
    // Trait vertical : vers le bord haut ou bas.
    if (y === b) pdf.line(x, 0, x, inner)
    else pdf.line(x, H - inner, x, H)
  }
}
