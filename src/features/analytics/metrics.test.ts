import { describe, it, expect } from 'vitest'
import { computeKpis, topBy, timeSeries, deltaPct, recentEvents, topSources, sourceCategory, topSourceCategories, cityCounts, type AnalyticsEvent } from './metrics'

const ev = (o: Partial<AnalyticsEvent>): AnalyticsEvent => ({
  ts: 0, path: '/promo', area: 'promo', ref: null, src: null,
  device: 'desktop', os: null, browser: null, country: 'FR', city: null, vid: 'v1', sid: 's1', uid: null, ...o,
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

describe('cityCounts', () => {
  it('agrège par ville+pays, trie décroissant et ignore les events sans ville', () => {
    const out = cityCounts([
      ev({ city: 'Borgerhout', country: 'BE' }),
      ev({ city: 'Borgerhout', country: 'BE' }),
      ev({ city: 'Paris', country: 'FR' }),
      ev({ city: null }),
    ])
    expect(out).toEqual([
      { city: 'Borgerhout', country: 'BE', count: 2 },
      { city: 'Paris', country: 'FR', count: 1 },
    ])
  })
  it('distingue deux villes homonymes de pays différents', () => {
    const out = cityCounts([ev({ city: 'Paris', country: 'FR' }), ev({ city: 'Paris', country: 'US' })])
    expect(out).toHaveLength(2)
  })
})

describe('topSources', () => {
  it('retombe sur ref quand src absent', () => {
    const out = topSources([ev({ src: null, ref: 'google.com' }), ev({ src: 'newsletter', ref: 'x.com' })], 8)
    expect(out).toContainEqual({ label: 'google.com', count: 1 })
    expect(out).toContainEqual({ label: 'newsletter', count: 1 })
  })
})

describe('sourceCategory', () => {
  it('mappe les domaines connus vers un canal lisible', () => {
    expect(sourceCategory('www.linkedin.com')).toBe('LinkedIn')
    expect(sourceCategory('lnkd.in')).toBe('LinkedIn')
    expect(sourceCategory('google.fr')).toBe('Google')
    expect(sourceCategory('t.co')).toBe('X (Twitter)')
    expect(sourceCategory('l.facebook.com')).toBe('Facebook')
    expect(sourceCategory('newsletter')).toBe('Email')
  })
  it('classe l’accès direct (source nulle) en « Direct »', () => {
    expect(sourceCategory(null)).toBe('Direct')
  })
  it('conserve un domaine inconnu tel quel', () => {
    expect(sourceCategory('blog.exemple.com')).toBe('blog.exemple.com')
  })
  it('ne confond pas un domaine se terminant par x.com (ex. netflix) avec X', () => {
    expect(sourceCategory('netflix.com')).toBe('netflix.com')
  })
})

describe('topSourceCategories', () => {
  it('regroupe par canal et compte l’accès direct comme « Direct »', () => {
    const out = topSourceCategories(
      [ev({ ref: 'google.com' }), ev({ ref: 'www.google.fr' }), ev({ src: 'linkedin' }), ev({ ref: null, src: null })],
      8,
    )
    expect(out).toContainEqual({ label: 'Google', count: 2 })
    expect(out).toContainEqual({ label: 'LinkedIn', count: 1 })
    expect(out).toContainEqual({ label: 'Direct', count: 1 })
  })
})
