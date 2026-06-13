// src/features/merge/fitToZone.test.ts
import { describe, it, expect } from 'vitest'
import { fitScaleForWidth, clampFitFont, MIN_FIT_FONT } from './fitToZone'

describe('fitScaleForWidth', () => {
  it('ne réduit pas quand le texte tient déjà', () => {
    expect(fitScaleForWidth(80, 100)).toBe(1)
    expect(fitScaleForWidth(100, 100)).toBe(1)
  })

  it('réduit proportionnellement quand le texte déborde', () => {
    expect(fitScaleForWidth(200, 100)).toBe(0.5)
    expect(fitScaleForWidth(150, 100)).toBeCloseTo(0.6667, 3)
  })

  it('entrées invalides → pas de réduction', () => {
    expect(fitScaleForWidth(0, 100)).toBe(1)
    expect(fitScaleForWidth(100, 0)).toBe(1)
    expect(fitScaleForWidth(-5, 100)).toBe(1)
  })
})

describe('clampFitFont', () => {
  it('borne au plancher lisible', () => {
    expect(clampFitFont(4)).toBe(MIN_FIT_FONT)
    expect(clampFitFont(20)).toBe(20)
  })
})
