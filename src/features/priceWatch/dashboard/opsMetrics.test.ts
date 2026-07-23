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
    // a : progress=1 → son balayage terminé compte (4+1 = 5 cycles) → 8000/5 = 1600.
    // b : en cours (0.5) → 2 cycles → 6000/2 = 3000 → le plus lent = b.
    expect(ck.competitors.find((c) => c.siteId === 'a')?.cycleMs).toBe(1600)
    expect(ck.slowestCycle).toEqual({ domain: 'b.fr', cycleMs: 3000 })
    // cycles GARANTIS = min(5, 2) = 2 ; balayage moyen = (1 + 0.5) / 2 = 0.75.
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

  it('la méta LIVE prime sur le snapshot du rapport (bouge sans « Comparer »)', () => {
    const rep = report([
      { siteId: 'a', domain: 'a.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: audit(100),
        harvest: { lastMs: 1000, cumulMs: 4000, progress: 0.4, sweeps: 2 } }, // snapshot figé
    ])
    const live = new Map([['a', { harvestProgress: 0.9, harvestSweeps: 5, cumulHarvestMs: 10000, updatedAt: 5_000 }]])
    const ck = buildOpsCockpit(rep, live)
    const c = ck.competitors[0]
    expect(c.progress).toBeCloseTo(0.9) // live, pas 0.4
    expect(c.sweeps).toBe(5)            // live, pas 2
    expect(c.cycleMs).toBe(2000)        // 10000 / 5 (live)
    expect(ck.avgProgress).toBeCloseTo(0.9)
    expect(ck.lastCollectAt).toBe(5_000)
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

describe('buildOpsCockpit — balayage terminé en ATTENTE du cycle calendaire', () => {
  it('compte un balayage done (progress=1) comme cycle bouclé même si sweeps=0', () => {
    // `sweeps` n'est incrémenté qu'à la RÉOUVERTURE du balayage suivant (openSweep).
    // En mode cycle calendaire, un site fini attend la relance : sans correction, un
    // site 100 % bouclé affichait ×0 pendant des heures (constaté : « 0/13 bouclés »
    // avec 8 sites terminés, tuile durée de cycle vide).
    const ck = buildOpsCockpit(report([
      { siteId: 'a', domain: 'a.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: audit(100),
        harvest: { lastMs: 1000, cumulMs: 9000, progress: 1, sweeps: 0 } },
    ]))
    expect(ck.sitesComplete).toBe(1)
    expect(ck.cyclesDone).toBe(1)
    // Durée d'un cycle calculable dès le premier balayage bouclé.
    expect(ck.slowestCycle).toEqual({ domain: 'a.fr', cycleMs: 9000 })
  })
})
