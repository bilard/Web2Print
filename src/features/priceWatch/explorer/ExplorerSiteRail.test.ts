import { describe, it, expect } from 'vitest'
import { buildRail } from './ExplorerSiteRail'
import type { HarvestMeta } from '../dashboard/opsMetrics'
import type { CompetitorStat } from '../catalog/report'

const EMPTY_AUDIT = { indexed: 0, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 }

const stat = (over: Partial<CompetitorStat> & { siteId: string; domain: string }): CompetitorStat => ({
  matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: EMPTY_AUDIT, ...over,
})

describe('buildRail', () => {
  const meta = new Map<string, HarvestMeta>([
    ['a', { domain: 'www.a.fr', productCount: 8000, pctPrice: 92 }],
    ['b', { domain: 'b.fr', productCount: 200, pctPrice: 30 }],
  ])
  const stats = [
    stat({ siteId: 'a', domain: 'www.a.fr', matched: 1200, cheaper: 300, ruptures: 18, medGapPct: -4.2, avgGapPct: 12 }),
  ]

  it('fusionne méta de moisson et stats du rapport', () => {
    const rail = buildRail(meta, stats)
    expect(rail.map((r) => r.siteId)).toEqual(['a', 'b'])
    expect(rail[0]).toMatchObject({ domain: 'a.fr', collected: 8000, pctPrice: 92, matched: 1200, cheaper: 300, ruptures: 18, medGapPct: -4.2 })
  })

  it('préfère la MÉDIANE à la moyenne, qui dérive sur un ratio tronqué', () => {
    expect(buildRail(meta, stats)[0].medGapPct).toBe(-4.2)
    const noMedian = [stat({ siteId: 'a', domain: 'a.fr', avgGapPct: 12 })]
    expect(buildRail(meta, noMedian)[0].medGapPct).toBe(12)
  })

  it('garde un site présent dans une seule des deux sources', () => {
    const orphanStat = buildRail(new Map(), [stat({ siteId: 'z', domain: 'z.fr', matched: 5 })])
    expect(orphanStat[0]).toMatchObject({ domain: 'z.fr', collected: 0, matched: 5, pctPrice: null })

    const orphanMeta = buildRail(new Map([['y', { domain: 'y.fr', productCount: 10 }]]), [])
    expect(orphanMeta[0]).toMatchObject({ domain: 'y.fr', collected: 10, matched: 0, medGapPct: null })
  })

  it('classe par volume collecté, à égalité par domaine', () => {
    const m = new Map<string, HarvestMeta>([
      ['x', { domain: 'x.fr', productCount: 10 }],
      ['c', { domain: 'c.fr', productCount: 10 }],
      ['big', { domain: 'big.fr', productCount: 99 }],
    ])
    expect(buildRail(m, []).map((r) => r.domain)).toEqual(['big.fr', 'c.fr', 'x.fr'])
  })
})
