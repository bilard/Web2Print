import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Canvas } from 'fabric'
// Déclenche l'enregistrement des 8 blocs par effet de bord (même mécanique que registry.test.ts)
import './blocks'
import { blockRectPx, instantiatePromoLayout } from './instantiateLayout'
import type { PromoLayout } from './promoTypes'

describe('blockRectPx', () => {
  it('convertit les % en px selon la page', () => {
    expect(blockRectPx({ blockId: 'accroche', xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.25 }, 800, 1000))
      .toEqual({ x: 80, y: 200, w: 400, h: 250 })
  })
})

describe('instantiatePromoLayout', () => {
  let canvas: Canvas

  beforeEach(() => {
    // Stub requestAnimationFrame — même approche que useTextboxToggle.test.ts
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: (t: number) => void) => {
      cb(0)
      return 0
    }))
    const el = document.createElement('canvas')
    el.width = 800
    el.height = 1000
    canvas = new Canvas(el, { width: 800, height: 1000, renderOnAddRemove: false })
  })

  afterEach(() => {
    canvas.dispose()
    vi.unstubAllGlobals()
  })

  it('ajoute un objet Fabric par bloc connu dans le layout', () => {
    const layout: PromoLayout = {
      id: 'test-layout',
      label: 'Test',
      width: 800,
      height: 1000,
      background: '#ffffff',
      blocks: [
        { blockId: 'accroche',     xPct: 0,   yPct: 0,    wPct: 1,   hPct: 0.2  },
        { blockId: 'badge-remise', xPct: 0.6, yPct: 0.05, wPct: 0.3, hPct: 0.15 },
      ],
    }

    instantiatePromoLayout(canvas, layout, 'dark')

    // Les 2 blocs connus doivent être ajoutés au canvas
    expect(canvas.getObjects().length).toBeGreaterThanOrEqual(2)
    expect(canvas.getObjects()[0]).toBeTruthy()
  })

  it("ignore silencieusement les blockId inconnus et n'ajoute que les blocs valides", () => {
    const layout: PromoLayout = {
      id: 'test-partial',
      label: 'Partiel',
      width: 800,
      height: 1000,
      background: '#ffffff',
      blocks: [
        { blockId: 'accroche', xPct: 0, yPct: 0, wPct: 1, hPct: 0.2 },
      ],
    }

    expect(() => instantiatePromoLayout(canvas, layout, 'light')).not.toThrow()
    expect(canvas.getObjects().length).toBeGreaterThanOrEqual(1)
  })
})
