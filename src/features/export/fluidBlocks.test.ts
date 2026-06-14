import { describe, it, expect } from 'vitest'
import { applyFluidBlocks, type FluidBlock } from './fluidBlocks'

const obj = (left: number, top: number, w = 100, h = 100) => ({ left, top, width: w, height: h, scaleX: 1, scaleY: 1 })

describe('applyFluidBlocks', () => {
  it('préserve la composition INTERNE d’un bloc (même facteur pour tous ses objets)', () => {
    // Deux objets d’un même bloc, source 1000×1000 → cible 500×500.
    // Bloc région plein cadre (0,0,1,1). bbox bloc = (100,100)..(300,300) → bw=bh=200.
    // contain s = min(500/200,500/200)=2.5 ; bloc centré: bw*s=500 → offX=offY=0 ; -x0*s = -250.
    const objects = [obj(100, 100), obj(200, 200)]
    const blocks: FluidBlock[] = [{ indices: [0, 1], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 500, 500, blocks)
    // o0: (100-100)*2.5 + 0 = 0 ; o1: (200-100)*2.5 + 0 = 250
    expect(out[0].left).toBe(0)
    expect(out[1].left).toBe(250)
    // écart relatif conservé (×s) : 250-0 = 2.5×(200-100)
    expect((out[1].left as number) - (out[0].left as number)).toBe(250)
    expect(out[0].scaleX).toBe(2.5)
    expect(out[1].scaleX).toBe(2.5)
  })

  it('objet sans bloc → repli cover (jamais laissé en place brut)', () => {
    // Objet d’index 1 non assigné. Source 1000×1000 → 1000×2000, cover s=max(1,2)=2.
    const objects = [obj(0, 0), obj(100, 100)]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 1000, 2000, blocks)
    expect(out[1].scaleX).toBe(2) // cover overscale
    expect(out[1].left).toBe(100 * 2 + (1000 - 1000 * 2) / 2) // = -300
  })

  it('bloc à bbox nulle → ses objets tombent en repli cover', () => {
    const objects = [{ left: 50, top: 50, width: 0, height: 0, scaleX: 1, scaleY: 1 }]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: 0, yPct: 0, wPct: 1, hPct: 1 }]
    const out = applyFluidBlocks(objects, 1000, 1000, 500, 500, blocks)
    // cover d’un objet à bbox nulle : projectObjectsToFormat le scale quand même (s défini)
    expect(out[0].left).toBeDefined()
    expect(out[0]).not.toBe(objects[0]) // nouvel objet
  })

  it('région hors bornes clampée + ne mute pas la source', () => {
    const src = [obj(0, 0)]
    const blocks: FluidBlock[] = [{ indices: [0], xPct: -1, yPct: 0, wPct: 5, hPct: 1 }]
    const out = applyFluidBlocks(src, 800, 600, 400, 300, blocks)
    expect(Number.isFinite(out[0].left as number)).toBe(true)
    expect(src[0].left).toBe(0)
  })
})
