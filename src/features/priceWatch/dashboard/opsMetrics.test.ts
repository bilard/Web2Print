import { describe, it, expect } from 'vitest'
import { buildOpsCockpit } from './opsMetrics'
import type { StoredReport } from '../reportStore'
import type { CompetitorStat } from '../catalog/report'

const audit = (indexed: number, pctPrice = 100): CompetitorStat['audit'] =>
  ({ indexed, pctPrice, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 })

function report(byCompetitor: CompetitorStat[], runAt = 1_000): StoredReport {
  return {
    runAt,
    kpis: { products: 0, matchedExact: 0, matchedOriginOnly: 0, sites: byCompetitor.length, comparisons: 0, cheaperThanMe: 0, aligned: 0, dearerThanMe: 0, ruptures: 0, productsUndercut: 0 },
    byCompetitor, sites: byCompetitor.map((c) => ({ siteId: c.siteId, domain: c.domain })),
    products: [], totalMatched: 0, truncated: false,
  }
}

describe('buildOpsCockpit', () => {
  it('agrège fiches, temps et cycles sur les concurrents actifs', () => {
    const ck = buildOpsCockpit(report([
      { siteId: 'a', domain: 'a.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: audit(100),
        harvest: { lastMs: 1000, cumulMs: 8000, progress: 1, sweeps: 4 } },
      { siteId: 'b', domain: 'b.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: audit(50),
        harvest: { lastMs: 500, cumulMs: 6000, progress: 0.5, sweeps: 2 } },
    ]))
    expect(ck.totalIndexed).toBe(150)
    expect(ck.totalCumulMs).toBe(14000)
    expect(ck.sitesActive).toBe(2)
    // durée d'un cycle = cumulMs / sweeps → a: 2000, b: 3000 → le plus lent = b (3000).
    expect(ck.competitors.find((c) => c.siteId === 'a')?.cycleMs).toBe(2000)
    expect(ck.slowestCycle).toEqual({ domain: 'b.fr', cycleMs: 3000 })
    // cycles GARANTIS = min(sweeps) = 2 ; balayage moyen = (1 + 0.5) / 2 = 0.75.
    expect(ck.cyclesDone).toBe(2)
    expect(ck.avgProgress).toBeCloseTo(0.75)
  })

  it('ignore un site à 0 fiche même si progress=1 (garde-fou « vert à 0% »)', () => {
    const ck = buildOpsCockpit(report([
      { siteId: 'z', domain: 'z.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: audit(0),
        harvest: { lastMs: 0, cumulMs: 0, progress: 1, sweeps: 1 } },
    ]))
    expect(ck.hasData).toBe(false)
    expect(ck.sitesActive).toBe(0)
    expect(ck.avgProgress).toBe(0)
    expect(ck.cyclesDone).toBe(0)
    expect(ck.slowestCycle).toBeNull()
  })

  it('reste robuste sans données de moisson (rapport ancien)', () => {
    const ck = buildOpsCockpit(report([
      { siteId: 'a', domain: 'a.fr', matched: 5, cheaper: 1, ruptures: 0, avgGapPct: -2, audit: audit(30) },
    ]))
    expect(ck.hasData).toBe(true)
    expect(ck.totalCumulMs).toBe(0)
    expect(ck.competitors[0].cycleMs).toBeNull()
    expect(ck.slowestCycle).toBeNull()
  })
})
