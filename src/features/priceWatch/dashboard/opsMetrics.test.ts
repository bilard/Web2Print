import { describe, it, expect } from 'vitest'
import { buildOpsCockpit, type HarvestMeta , scopeCockpit } from './opsMetrics'
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

describe('sites décochés', () => {
  it('ne les compte ni dans les jauges ni dans le goulot du cycle', () => {
    // Cas vécu : leroymerlin.fr décoché depuis des semaines s'affichait « le + lent »
    // du cycle, et pesait sur « 18/19 sites bouclés ».
    const meta = new Map<string, HarvestMeta>([
      ['a', { domain: 'a.fr', productCount: 100, harvestProgress: 1, harvestSweeps: 2, cumulHarvestMs: 60_000, enabled: true }],
      ['slow', { domain: 'leroymerlin.fr', productCount: 100, harvestProgress: 1, harvestSweeps: 1, cumulHarvestMs: 4_600_000, enabled: false }],
    ])
    const report = {
      runAt: 1, kpis: {}, sites: [], products: [], totalMatched: 0, truncated: false,
      byCompetitor: [
        { siteId: 'a', domain: 'a.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: { indexed: 100, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 } },
        { siteId: 'slow', domain: 'leroymerlin.fr', matched: 0, cheaper: 0, ruptures: 0, avgGapPct: null, audit: { indexed: 100, pctPrice: 0, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 } },
      ],
    } as unknown as StoredReport

    const ops = buildOpsCockpit(report, meta)
    expect(ops.sitesActive).toBe(1)
    expect(ops.sitesTotal).toBe(1)
    expect(ops.slowestCycle?.domain).toBe('a.fr')
  })
})

describe('comptes de concurrents', () => {
  const audit = { indexed: 10, pctPrice: 100, pctListPrice: 0, pctStock: 0, pctName: 0, pctImage: 0, pctRef: 0 }
  const stat = (i: number) => ({
    siteId: `s${i}`, domain: `s${i}.fr`, matched: 1, cheaper: 0, ruptures: 0,
    avgGapPct: null, medGapPct: null, audit,
  })
  const report = (sites: number, known: number) => ({
    runAt: 1, kpis: {}, products: [], totalMatched: 0, truncated: false,
    byCompetitor: Array.from({ length: known }, (_, i) => stat(i)),
    sites: Array.from({ length: sites }, (_, i) => ({ siteId: `s${i}`, domain: `s${i}.fr` })),
  }) as unknown as Parameters<typeof buildOpsCockpit>[0]

  it('compte les SUIVIS de la dernière analyse sur tous les concurrents connus', () => {
    expect(buildOpsCockpit(report(14, 24)).counts).toEqual({ active: 14, inactive: 10, total: 24 })
  })

  it('retombe sur les sites qui ont des données quand le rapport ne liste pas les siens', () => {
    // Analyses écrites avant que `sites` soit persisté : sans repli, « 0 actif sur 24 ».
    const old = { ...report(0, 24), sites: [] } as unknown as Parameters<typeof buildOpsCockpit>[0]
    expect(buildOpsCockpit(old).counts).toEqual({ active: 24, inactive: 0, total: 24 })
  })
})

describe('⚠⚠ le périmètre gouverne TOUT le panneau, pas seulement la liste', () => {
  const comp = (siteId: string, indexed: number, enabled: boolean, sweeps = 1) => ({
    siteId, domain: `${siteId}.fr`, indexed, progress: 1, sweeps, cumulMs: 60_000,
    cycleMs: 60_000, pctPrice: 100, enabled,
  })

  it('recalcule volume et temps sur les seuls concurrents affichés', () => {
    // « 442 773 fiches collectées » au-dessus de trois lignes de concurrents actifs
    // additionnait vingt-quatre sites, dont vingt et un ne tournent plus : le chiffre est
    // juste et la lecture fausse.
    const ck = {
      competitors: [comp('a', 100, true), comp('b', 900, false)],
      totalIndexed: 1000, totalCumulMs: 120_000, avgProgress: 1, sitesActive: 1, sitesTotal: 2,
      counts: { active: 1, inactive: 1, total: 2 }, sitesComplete: 2, cyclesDone: 1,
      slowestCycle: null, runAt: 0, lastCollectAt: null, lastCollectDomain: null,
    } as unknown as Parameters<typeof scopeCockpit>[0]

    expect(scopeCockpit(ck, 'all').totalIndexed).toBe(1000)
    const actifs = scopeCockpit(ck, 'active')
    expect(actifs.totalIndexed).toBe(100)
    expect(actifs.totalCumulMs).toBe(60_000)
    expect(actifs.competitors).toHaveLength(1)
  })

  it('⚠ « Tous » recalcule AUSSI — sinon le sous-titre contredit la liste', () => {
    // Rendre le cockpit intact laissait `sitesActive` à 3 : le panneau annonçait
    // « 442 773 fiches · 3/3 concurrents actifs » en montrant vingt-deux lignes.
    const ck = {
      competitors: [comp('a', 100, true), comp('b', 900, false)],
      totalIndexed: 1000, totalCumulMs: 120_000, avgProgress: 1, sitesActive: 1, sitesTotal: 2,
      counts: { active: 1, inactive: 1, total: 2 }, sitesComplete: 2, cyclesDone: 1,
      slowestCycle: null, runAt: 0, lastCollectAt: null, lastCollectDomain: null,
    } as unknown as Parameters<typeof scopeCockpit>[0]
    const tous = scopeCockpit(ck, 'all')
    expect(tous.sitesActive).toBe(2)
    expect(tous.totalIndexed).toBe(1000)
    // Le triplet de la tuile « Concurrents actifs » reste global : c'est son sujet.
    expect(tous.counts).toEqual({ active: 1, inactive: 1, total: 2 })
  })
})
