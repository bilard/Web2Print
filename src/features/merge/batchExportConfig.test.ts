import { describe, it, expect } from 'vitest'
import { dpiToMultiplier } from './useBatchExport'

describe('dpiToMultiplier', () => {
  it('72→1, 150→~2.08, 300→~4.17', () => {
    expect(dpiToMultiplier(72)).toBe(1)
    expect(dpiToMultiplier(150)).toBeCloseTo(150 / 72, 5)
    expect(dpiToMultiplier(300)).toBeCloseTo(300 / 72, 5)
  })
  it('défaut 150 si undefined', () => {
    expect(dpiToMultiplier(undefined)).toBeCloseTo(150 / 72, 5)
  })
})
