// src/features/stats/usePipelineRuns.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (sel: (s: { user: null }) => unknown) => sel({ user: null }) }))

import { formatRunDuration } from './usePipelineRuns'

describe('formatRunDuration', () => {
  it('millisecondes sous 1 s', () => {
    expect(formatRunDuration(480)).toBe('480 ms')
  })
  it('secondes avec décimale sous 10 s, arrondies au-delà', () => {
    expect(formatRunDuration(2_500)).toBe('2.5 s')
    expect(formatRunDuration(42_300)).toBe('42 s')
  })
  it('minutes avec secondes sur 2 chiffres', () => {
    expect(formatRunDuration(65_000)).toBe('1 min 05')
    expect(formatRunDuration(605_000)).toBe('10 min 05')
  })
})
