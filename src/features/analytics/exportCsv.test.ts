import { describe, it, expect } from 'vitest'
import { eventsToCsv } from './exportCsv'
import type { AnalyticsEvent } from './metrics'

const ev: AnalyticsEvent = {
  ts: 0, path: '/promo', area: 'promo', ref: 'google.com', src: null,
  device: 'mobile', country: 'FR', vid: 'v1', sid: 's1', uid: null,
}

describe('eventsToCsv', () => {
  it('produit un en-tête et une ligne par event', () => {
    const csv = eventsToCsv([ev])
    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('path')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('/promo')
  })
})
