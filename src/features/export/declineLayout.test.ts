// src/features/export/declineLayout.test.ts
import { describe, it, expect } from 'vitest'
import { projectObjectsToFormat } from './declineLayout'

describe('projectObjectsToFormat', () => {
  it('scale « contain » + centrage vertical sur un cadre plus haut (carré → story)', () => {
    // Source 1000×1000, cible 1000×2000 → s = 1, bande haute/basse de 500.
    const [o] = projectObjectsToFormat(
      [{ left: 100, top: 100, scaleX: 1, scaleY: 1 }],
      1000,
      1000,
      1000,
      2000,
    )
    expect(o.scaleX).toBe(1)
    expect(o.left).toBe(100) // pas d'offset horizontal
    expect(o.top).toBe(600) // 100*1 + (2000-1000)/2
  })

  it('réduit et centre horizontalement quand la cible est plus large (carré → bannière)', () => {
    // Source 1000×1000, cible 1500×500 → s = 0.5, largeur projetée 500, offsetX 500.
    const [o] = projectObjectsToFormat(
      [{ left: 200, top: 200, scaleX: 2, scaleY: 2 }],
      1000,
      1000,
      1500,
      500,
    )
    expect(o.scaleX).toBe(1) // 2 * 0.5
    expect(o.scaleY).toBe(1)
    expect(o.left).toBe(600) // 200*0.5 + (1500-500)/2
    expect(o.top).toBe(100) // 200*0.5 + (500-500)/2
  })

  it('préserve les autres champs et ne mute pas la source', () => {
    const src = [{ left: 0, top: 0, fill: '#abc', data: { id: 'x' } }]
    const [o] = projectObjectsToFormat(src, 800, 600, 400, 300)
    expect(o.fill).toBe('#abc')
    expect(o.data).toEqual({ id: 'x' })
    expect(src[0].left).toBe(0) // source intacte
  })

  it('dimensions source invalides → copie sans transformer', () => {
    const out = projectObjectsToFormat([{ left: 10, top: 10 }], 0, 0, 100, 100)
    expect(out[0].left).toBe(10)
  })
})
