import { describe, it, expect } from 'vitest'
import {
  buildScrapeRows, countByStatus, isCursorDomain, runPulse, scrapeStatus, LIVE_WINDOW_MS,
  type RunPulse,
} from './scrapeState'
import type { OpsCockpit } from '../dashboard/opsMetrics'
import type { StoredReport } from '../reportStore'

const NOW = 1_700_000_000_000

/** Un run serveur tourne (cas nominal d'une moisson). */
const RUNNING: RunPulse = { active: true, startedAt: NOW - 60_000, endedAt: null }
/** Plus rien ne tourne : dernier run terminé il y a 10 s (STOP / fin normale). */
const ENDED: RunPulse = { active: false, startedAt: NOW - 600_000, endedAt: NOW - 10_000 }
/** Aucun run serveur jamais observé (moisson d'un site lancée à la main depuis l'app). */
const UNKNOWN: RunPulse = { active: false, startedAt: null, endedAt: null }

const ops = (patch: Partial<OpsCockpit> = {}): OpsCockpit => ({
  totalIndexed: 10, totalCumulMs: 0, avgProgress: 0.5, sitesActive: 1, sitesTotal: 1,
  counts: { active: 1, inactive: 0, total: 1 },
  sitesComplete: 0, cyclesDone: 0, slowestCycle: null, runAt: NOW, lastCollectAt: null,
  lastCollectDomain: null, hasData: true,
  totalPages: 0, lastPassProducts: 0, lastPassPages: 0, sitesCollecting: 0,
  competitors: [{ siteId: 'a', domain: 'www.exemple.com', indexed: 10, progress: 0.5, sweeps: 0, cumulMs: 0, cycleMs: null, pctPrice: 90 }],
  ...patch,
})

describe('isCursorDomain', () => {
  it('reconnaît les docs curseur de la recherche dirigée', () => {
    expect(isCursorDomain('directed-cursor')).toBe(true)
    expect(isCursorDomain('directed-auth-cursor')).toBe(true)
    expect(isCursorDomain('cursor-shop.com')).toBe(false)
  })
})

describe('runPulse', () => {
  it('actif dès que l’état live du run dit « running »', () => {
    expect(runPulse(null, { status: 'running', startedAt: NOW - 60_000 }, NOW).active).toBe(true)
  })

  it('ignore un run « running » zombie (process mort sans écrire sa fin)', () => {
    expect(runPulse(null, { status: 'running', startedAt: NOW - 40 * 60_000 }, NOW).active).toBe(false)
  })

  it('retient la fin du run — état live prioritaire sur le planning', () => {
    expect(runPulse({ enabled: true, nextRunAt: NOW, lastEndAt: NOW - 900_000 }, { status: 'success', endedAt: NOW - 60_000 }, NOW))
      .toMatchObject({ active: false, endedAt: NOW - 60_000 })
  })

  it('se rabat sur le planning quand aucun état live n’existe', () => {
    expect(runPulse({ enabled: true, nextRunAt: NOW, lastStatus: 'running' }, null, NOW).active).toBe(true)
  })
})

describe('scrapeStatus', () => {
  it('en cours quand une passe de moisson vient d’écrire', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 10_000, lastCollectDomain: 'www.exemple.com' }), null, RUNNING, NOW)
    expect(s.state).toBe('running')
    expect(s.label).toBe('Scraping en cours · exemple.com')
  })

  it('en cours sans nommer un doc curseur', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 10_000, lastCollectDomain: 'directed-auth-cursor' }), null, RUNNING, NOW)
    expect(s.state).toBe('running')
    expect(s.label).toBe('Scraping en cours')
  })

  it('en attente quand le cron est actif entre deux runs', () => {
    const s = scrapeStatus(ops(), { enabled: true, nextRunAt: NOW + 600_000 }, UNKNOWN, NOW)
    expect(s.state).toBe('waiting')
  })

  it('à l’arrêt sans planification', () => {
    expect(scrapeStatus(ops(), null, UNKNOWN, NOW).state).toBe('idle')
  })

  it('un battement ANTÉRIEUR à la fin du run ne fait plus « en cours » (après STOP)', () => {
    // Battement tout frais (20 s)… mais le run s'est terminé après lui.
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 20_000, lastCollectDomain: 'www.exemple.com' }),
      { enabled: true, nextRunAt: NOW + 60_000, lastStatus: 'stopped' }, ENDED, NOW)
    expect(s.state).toBe('waiting')
  })

  it('après une SUSPENSION, le battement résiduel ne fait plus « en cours »', () => {
    // Ordre réel : dernier battement (20 s), PUIS fin du run (10 s) — le planning a été
    // supprimé par la suspension, seul l'état live subsiste.
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 20_000, lastCollectDomain: 'www.exemple.com' }), null, ENDED, NOW)
    expect(s.state).toBe('idle')
  })

  it('un battement POSTÉRIEUR à la fin du dernier run reste vivant (run manuel)', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 5_000, lastCollectDomain: 'www.exemple.com' }),
      { enabled: true, nextRunAt: NOW + 60_000, lastStatus: 'success' },
      { active: false, startedAt: NOW - 900_000, endedAt: NOW - 300_000 }, NOW)
    expect(s.state).toBe('running')
  })
})

describe('buildScrapeRows', () => {
  const report = {
    runAt: NOW, kpis: {}, sites: [], products: [], totalMatched: 0, truncated: false,
    byCompetitor: [
      { siteId: 'a', domain: 'a.com', matched: 12, audit: { indexed: 100, pctPrice: 80 } },
      { siteId: 'cur', domain: 'directed-auth-cursor', matched: 0, audit: { indexed: 0, pctPrice: 0 } },
    ],
  } as unknown as StoredReport

  it('exclut les docs curseur et fait primer la méta LIVE', () => {
    const meta = new Map([['a', { domain: 'a.com', productCount: 140, pctPrice: 95, updatedAt: NOW - 5_000, harvestBeatAt: NOW - 5_000, lastPassAt: NOW - 5_000, lastPassPages: 20, lastPassProducts: 40 }]])
    const rows = buildScrapeRows(report, meta, NOW, RUNNING)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ domain: 'a.com', products: 140, pctPrice: 95, matched: 12, live: true, status: 'live' })
  })

  it('une rafale du node « Comparer » n’allume AUCUNE ligne (updatedAt frais partout)', () => {
    // Signature observée en prod : les 13 métas réécrites à la même milliseconde, sans
    // qu'aucune moisson ne tourne → aucun `harvestBeatAt` récent.
    const burst = NOW - 2_000
    const meta = new Map([
      ['a', { domain: 'a.com', productCount: 100, updatedAt: burst, harvestBeatAt: NOW - 900_000, lastPassAt: NOW - 900_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['b', { domain: 'b.com', productCount: 50, updatedAt: burst, harvestBeatAt: NOW - 900_000, lastPassAt: NOW - 900_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['c', { domain: 'c.com', productCount: 10, updatedAt: burst, harvestBeatAt: NOW - 900_000, lastPassAt: NOW - 900_000, lastPassPages: 20, lastPassProducts: 40 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW, RUNNING)
    expect(rows.filter((r) => r.live)).toHaveLength(0)
  })

  it('plusieurs sites peuvent être EN COURS (moisson + recherche dirigée en parallèle)', () => {
    const meta = new Map([
      ['a', { domain: 'a.com', productCount: 100, updatedAt: NOW - 3_000, harvestBeatAt: NOW - 3_000, lastPassAt: NOW - 600_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['b', { domain: 'b.com', productCount: 50, updatedAt: NOW - 2_000, harvestBeatAt: NOW - 2_000, lastPassAt: NOW - 600_000, lastPassPages: 20, lastPassProducts: 40 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW, RUNNING)
    expect(rows.filter((r) => r.live).map((r) => r.domain).sort()).toEqual(['a.com', 'b.com'])
  })

  it('aucune ligne « en cours » quand le run est terminé (STOP / suspension)', () => {
    const meta = new Map([['a', { domain: 'a.com', productCount: 140, updatedAt: NOW - 20_000, harvestBeatAt: NOW - 20_000, lastPassAt: NOW - 20_000, lastPassPages: 20, lastPassProducts: 40 }]])
    const rows = buildScrapeRows(report, meta, NOW, ENDED)
    expect(rows.filter((r) => r.live)).toHaveLength(0)
    expect(rows[0].status).toBe('ok')
  })

  it('ajoute un site présent en LIVE seulement', () => {
    const meta = new Map([
      ['b', { domain: 'b.com', productCount: 5, updatedAt: NOW - 1_000, harvestBeatAt: NOW - 1_000, lastPassAt: NOW - 1_000, lastPassPages: 3, lastPassProducts: 5 }],
      ['a', { domain: 'a.com', productCount: 300, updatedAt: NOW - 3 * LIVE_WINDOW_MS, harvestBeatAt: NOW - 3 * LIVE_WINDOW_MS, lastPassAt: NOW - 3 * LIVE_WINDOW_MS, lastPassPages: 0, lastPassProducts: 0 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW, RUNNING)
    expect(rows.map((r) => r.domain)).toEqual(['a.com', 'b.com'])
    // a.com : 0 page moissonnée MAIS 300 fiches indexées = « Recherche seule », pas une
    // panne. La PWA ne passait pas `productCount` à `siteStatus` et affichait « ✗ » rouge.
    expect(countByStatus(rows)).toMatchObject({ live: 1, directed: 1 })
  })

  it('trie par ordre ALPHABÉTIQUE du nom affiché — « www. » ne range pas un site à W', () => {
    const meta = new Map([
      ['w', { domain: 'www.cdiscount.com', productCount: 1, updatedAt: NOW }],
      ['k', { domain: 'kramp.com', productCount: 9_000, updatedAt: NOW }],
      ['a', { domain: 'amazon.fr', productCount: 2, updatedAt: NOW }],
    ])
    const rows = buildScrapeRows(null, meta, NOW, ENDED)
    expect(rows.map((r) => r.domain)).toEqual(['amazon.fr', 'www.cdiscount.com', 'kramp.com'])
  })

  const cfg = (rows: [string, string, boolean][]) =>
    new Map(rows.map(([id, domain, enabled]) => [id, { domain, enabled }]))

  it('un site DÉSACTIVÉ dans la config sort du statut « live » et passe en dernier', () => {
    const meta = new Map([
      ['a', { domain: 'a.com', productCount: 140, updatedAt: NOW - 5_000, harvestBeatAt: NOW - 5_000, lastPassAt: NOW - 5_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['b', { domain: 'b.com', productCount: 5, updatedAt: NOW - 5_000, harvestBeatAt: NOW - 5_000, lastPassAt: NOW - 5_000, lastPassPages: 3, lastPassProducts: 5 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW, RUNNING, cfg([['a', 'a.com', false], ['b', 'b.com', true]]))
    expect(rows.map((r) => r.domain)).toEqual(['b.com', 'a.com'])
    const a = rows.find((r) => r.domain === 'a.com')!
    // Un battement résiduel ne doit pas rallumer un site qu'on vient de mettre en pause.
    expect(a).toMatchObject({ enabled: false, live: false, status: 'disabled' })
  })

  it('un site désactivé RESTE visible même sans la moindre donnée — sinon on ne peut plus le réactiver', () => {
    const rows = buildScrapeRows(null, new Map(), NOW, ENDED, cfg([['z', 'z.com', false]]))
    expect(rows.map((r) => r.domain)).toEqual(['z.com'])
    expect(rows[0]).toMatchObject({ enabled: false, status: 'disabled', products: 0 })
  })

  it('un site ABSENT de la config reste actif : l’index porte des concurrents retirés depuis', () => {
    const meta = new Map([['a', { domain: 'a.com', productCount: 140, updatedAt: NOW - 5_000, harvestBeatAt: NOW - 900_000, lastPassAt: NOW - 900_000, lastPassPages: 20, lastPassProducts: 40 }]])
    const rows = buildScrapeRows(report, meta, NOW, ENDED, cfg([['b', 'b.com', true]]))
    expect(rows.find((r) => r.domain === 'a.com')).toMatchObject({ enabled: true, status: 'ok' })
  })
})
