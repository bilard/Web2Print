// ⚠⚠ Ce que ces tests protègent : un point PEINT EN NOIR au milieu du nuage. La rampe est
// indexée par un rapport calculé (`depth`), et le moindre arrondi au-delà de 1 sortait du
// tableau — `undefined` se rend en noir, sans erreur, au milieu de points colorés.
import { describe, it, expect } from 'vitest'
import { RAMP_DARK, rampAt, rampCss } from './scatter3dRamp'

describe('la rampe de profondeur', () => {
  it('rend ses deux extrémités telles quelles', () => {
    expect(rampAt(RAMP_DARK, 0)).toBe(RAMP_DARK[0])
    expect(rampAt(RAMP_DARK, 1)).toBe(RAMP_DARK[RAMP_DARK.length - 1])
  })

  it('interpole entre deux crans', () => {
    const mid = rampAt(['#000000', '#ffffff'], 0.5)
    expect(mid).toBe('#808080')
  })

  it('borne au lieu de sortir du tableau — un point noir passerait inaperçu', () => {
    expect(rampAt(RAMP_DARK, 1.000001)).toBe(RAMP_DARK[RAMP_DARK.length - 1])
    expect(rampAt(RAMP_DARK, -0.5)).toBe(RAMP_DARK[0])
    expect(rampAt(RAMP_DARK, Number.NaN)).toBe(RAMP_DARK[0])
  })

  it('rend toujours un `#rrggbb` complet, sur toute la course', () => {
    for (let i = 0; i <= 20; i++) {
      expect(rampAt(RAMP_DARK, i / 20)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('compose le dégradé de la légende avec TOUS les crans', () => {
    const css = rampCss(RAMP_DARK)
    for (const stop of RAMP_DARK) expect(css).toContain(stop)
  })
})
