import { describe, it, expect } from 'vitest'
import { computeKpis, topBy, timeSeries, deltaPct, recentEvents, type AnalyticsEvent } from './metrics'

const ev = (o: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  ts: 0, path: '/promo', area: 'promo', ref: null, src: null,
  device: 'desktop', country: 'FR', vid: 'v1', sid: 's1', uid: null, ...o,
})

describe('computeKpis', () => {
  it('compte pages vues, visiteurs et sessions distincts', () => {
    const k = computeKpis([
      ev({ vid: 'a', sid: 's1', ts: 1000 }),
      ev({ vid: 'a', sid: 's1', ts: 5000 }),
      ev({ vid: 'b', sid: 's2', ts: 2000 }),
    ])
    expect(k.pageViews).toBe(3)
    expect(k.visitors).toBe(2)
    expect(k.sessions).toBe(2)
  })
  it('durée moyenne = écart 1er/dernier event par session', () => {
    const k = computeKpis([ev({ sid: 's1', ts: 0 }), ev({ sid: 's1', ts: 4000 })])
    expect(k.avgSessionMs).toBe(4000)
  })
  it('taux de rebond = part des sessions à 1 page vue', () => {
    const k = computeKpis([
      ev({ sid: 's1', ts: 0 }),
      ev({ sid: 's2', ts: 0 }), ev({ sid: 's2', ts: 1000 }),
    ])
    expect(k.bounceRate).toBeCloseTo(0.5)
  })
  it('jeu vide → zéros sans crash', () => {
    expect(computeKpis([])).toEqual({ pageViews: 0, visitors: 0, sessions: 0, avgSessionMs: 0, bounceRate: 0 })
  })
})

describe('topBy', () => {
  it('agrège et trie décroissant', () => {
    const top = topBy([ev({ path: '/a' }), ev({ path: '/a' }), ev({ path: '/b' })], 'path', 10)
    expect(top[0]).toEqual({ label: '/a', count: 2 })
    expect(top[1]).toEqual({ label: '/b', count: 1 })
  })
  it('ignore les valeurs nulles et applique la limite', () => {
    const top = topBy([ev({ src: null }), ev({ src: 'google.com' })], 'src', 1)
    expect(top).toEqual([{ label: 'google.com', count: 1 }])
  })
})

describe('timeSeries', () => {
  it('un point par jour avec pages vues et visiteurs', () => {
    const day = 86_400_000
    const ts = timeSeries(
      [ev({ ts: 0, vid: 'a' }), ev({ ts: 1000, vid: 'b' }), ev({ ts: day, vid: 'a' })],
      0, day,
    )
    expect(ts).toHaveLength(2)
    expect(ts[0]).toMatchObject({ pageViews: 2, visitors: 2 })
    expect(ts[1]).toMatchObject({ pageViews: 1, visitors: 1 })
  })
})

describe('deltaPct', () => {
  it('calcule la variation', () => expect(deltaPct(150, 100)).toBe(50))
  it('null si base 0', () => expect(deltaPct(5, 0)).toBeNull())
})

describe('recentEvents', () => {
  it('trie décroissant par ts et applique la limite', () => {
    const out = recentEvents([ev({ ts: 1 }), ev({ ts: 3 }), ev({ ts: 2 })], 2)
    expect(out.map((e) => e.ts)).toEqual([3, 2])
  })
})
