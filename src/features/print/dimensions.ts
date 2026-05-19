/**
 * Conversions d'unités print.
 * Standard : 1 pouce = 25.4 mm. À 300 DPI → 300 px/pouce → ~11.811 px/mm.
 *
 * IMPORTANT — DPI interne du canvas vs DPI d'export :
 *   • Le canvas Fabric stocke des coordonnées en POINTS (PostScript) :
 *     1 px canvas = 1 pt = 1/72 inch. C'est la convention de l'import IDML
 *     (PageWidth/PageHeight en pt) et de l'export PNG (multiplier = dpi/72,
 *     cf. useExportPng.ts).
 *   • La valeur `dpi` du store représente le DPI d'EXPORT (résolution
 *     d'impression cible : 72/150/300/600), PAS la densité du canvas.
 *   • Les éléments à taille physique constante (hirondelles, repères, bleed
 *     visuel) doivent utiliser `CANVAS_DPI` pour la conversion mm → canvas px,
 *     sinon ils changent de taille selon le réglage utilisateur.
 */

const MM_PER_INCH = 25.4

/** DPI interne du canvas : 1 px canvas = 1 pt = 1/72 inch. */
export const CANVAS_DPI = 72

/** Convertit des mm en pixels canvas (espace de coordonnées Fabric). */
export function mmToCanvasPx(mm: number): number {
  return (mm * CANVAS_DPI) / MM_PER_INCH
}

/** Convertit des pixels canvas en mm. */
export function canvasPxToMm(px: number): number {
  return (px * MM_PER_INCH) / CANVAS_DPI
}

function assertDpi(dpi: number): void {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new Error(`DPI invalide : ${dpi}. Doit être > 0.`)
  }
}

export function mmToPx(mm: number, dpi: number): number {
  assertDpi(dpi)
  return (mm * dpi) / MM_PER_INCH
}

export function pxToMm(px: number, dpi: number): number {
  assertDpi(dpi)
  return (px * MM_PER_INCH) / dpi
}

export function inchToPx(inch: number, dpi: number): number {
  assertDpi(dpi)
  return inch * dpi
}

export function pxToInch(px: number, dpi: number): number {
  assertDpi(dpi)
  return px / dpi
}
