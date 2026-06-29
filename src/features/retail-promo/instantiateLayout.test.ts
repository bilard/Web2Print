import { describe, it, expect } from 'vitest'
import { blockRectPx } from './instantiateLayout'

describe('blockRectPx', () => {
  it('convertit les % en px selon la page', () => {
    expect(blockRectPx({ blockId: 'accroche', xPct: 0.1, yPct: 0.2, wPct: 0.5, hPct: 0.25 }, 800, 1000))
      .toEqual({ x: 80, y: 200, w: 400, h: 250 })
  })
})
