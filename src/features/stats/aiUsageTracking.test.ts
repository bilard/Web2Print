import { describe, it, expect } from 'vitest'
import { computeCost } from './aiUsageTracking'

describe('aiUsageTracking.computeCost', () => {
  it('computes USD from token counts and pricing per 1M', () => {
    const cost = computeCost(
      { input: 1_000_000, output: 1_000_000 },
      { input: 15, output: 75 },
    )
    expect(cost).toBeCloseTo(90, 5)
  })

  it('handles fractional tokens correctly', () => {
    const cost = computeCost(
      { input: 1234, output: 567 },
      { input: 3, output: 15 },
    )
    expect(cost).toBeCloseTo(0.012207, 6)
  })

  it('returns 0 for unknown pricing (both 0)', () => {
    expect(computeCost({ input: 1000, output: 1000 }, { input: 0, output: 0 })).toBe(0)
  })

  it('returns 0 for zero tokens', () => {
    expect(computeCost({ input: 0, output: 0 }, { input: 15, output: 75 })).toBe(0)
  })
})
