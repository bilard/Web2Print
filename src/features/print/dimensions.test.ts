import { describe, it, expect } from 'vitest'
import { mmToPx, pxToMm, inchToPx, pxToInch, CANVAS_DPI, mmToCanvasPx, canvasPxToMm } from './dimensions'

describe('dimensions @ 300 DPI', () => {
  it('convertit A4 largeur (210 mm) en pixels', () => {
    expect(mmToPx(210, 300)).toBeCloseTo(2480.31, 1)
  })

  it('convertit A4 hauteur (297 mm) en pixels', () => {
    expect(mmToPx(297, 300)).toBeCloseTo(3507.87, 1)
  })

  it('pxToMm inverse exactement mmToPx', () => {
    const mm = 210
    expect(pxToMm(mmToPx(mm, 300), 300)).toBeCloseTo(mm, 5)
  })

  it('convertit 1 pouce en 300 px à 300 DPI', () => {
    expect(inchToPx(1, 300)).toBe(300)
  })

  it('convertit 300 px en 1 pouce à 300 DPI', () => {
    expect(pxToInch(300, 300)).toBe(1)
  })

  it('gère DPI écran standard (96)', () => {
    expect(mmToPx(25.4, 96)).toBeCloseTo(96, 5)
  })

  it('rejette DPI ≤ 0', () => {
    expect(() => mmToPx(100, 0)).toThrow(/DPI/)
    expect(() => mmToPx(100, -1)).toThrow(/DPI/)
  })
})

describe('CANVAS_DPI — espace canvas Fabric en pt (72 dpi)', () => {
  it('CANVAS_DPI vaut 72 (1 px canvas = 1 pt)', () => {
    expect(CANVAS_DPI).toBe(72)
  })

  it('convertit la largeur IDML (141.73 pt) en 50 mm', () => {
    expect(canvasPxToMm(141.73228346456693)).toBeCloseTo(50, 2)
  })

  it('convertit 50 mm en ≈141.73 px canvas', () => {
    expect(mmToCanvasPx(50)).toBeCloseTo(141.73, 2)
  })

  it('A4 (595 pt) ↔ 210 mm', () => {
    expect(canvasPxToMm(595)).toBeCloseTo(210, 0)
    expect(mmToCanvasPx(210)).toBeCloseTo(595.27, 1)
  })

  it('canvasPxToMm est l\'inverse de mmToCanvasPx', () => {
    expect(canvasPxToMm(mmToCanvasPx(75.8))).toBeCloseTo(75.8, 5)
  })

  it('hirondelle de 1.5 mm = ≈4.25 px canvas (taille physique constante)', () => {
    expect(mmToCanvasPx(1.5)).toBeCloseTo(4.25, 2)
  })
})
