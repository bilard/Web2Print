import { describe, it, expect } from 'vitest'
import { mmToPx, pxToMm, inchToPx, pxToInch } from './dimensions'

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
