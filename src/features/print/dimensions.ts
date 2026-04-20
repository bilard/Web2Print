/**
 * Conversions d'unités print.
 * Standard : 1 pouce = 25.4 mm. À 300 DPI → 300 px/pouce → ~11.811 px/mm.
 */

const MM_PER_INCH = 25.4

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
