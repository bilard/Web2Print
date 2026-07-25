import { describe, it, expect } from 'vitest'
import { buildScrapeRows, countByStatus, isCursorDomain, scrapeStatus, LIVE_WINDOW_MS } from './scrapeState'
import type { OpsCockpit } from '../dashboard/opsMetrics'
import type { StoredReport } from '../reportStore'

const NOW = 1_700_000_000_000

const ops = (patch: Partial<OpsCockpit> = {}): OpsCockpit => ({
  totalIndexed: 10, totalCumulMs: 0, avgProgress: 0.5, sitesActive: 1, sitesTotal: 1,
  sitesComplete: 0, cyclesDone: 0, slowestCycle: null, runAt: NOW, lastCollectAt: null,
  lastCollectDomain: null, hasData: true,
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

describe('scrapeStatus', () => {
  it('en cours quand une passe de moisson vient d’écrire', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 10_000, lastCollectDomain: 'www.exemple.com' }), null, NOW)
    expect(s.state).toBe('running')
    expect(s.label).toBe('Scraping en cours · exemple.com')
  })

  it('en cours sans nommer un doc curseur', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 10_000, lastCollectDomain: 'directed-auth-cursor' }), null, NOW)
    expect(s.state).toBe('running')
    expect(s.label).toBe('Scraping en cours')
  })

  it('en cours si le run serveur détient le verrou, même sans heartbeat frais', () => {
    const s = scrapeStatus(ops({ lastCollectAt: NOW - 10 * LIVE_WINDOW_MS }), { enabled: true, nextRunAt: NOW + 60_000, lastStatus: 'running' }, NOW)
    expect(s.state).toBe('running')
  })

  it('en attente quand le cron est actif entre deux runs', () => {
    const s = scrapeStatus(ops(), { enabled: true, nextRunAt: NOW + 600_000 }, NOW)
    expect(s.state).toBe('waiting')
  })

  it('à l’arrêt sans planification', () => {
    expect(scrapeStatus(ops(), null, NOW).state).toBe('idle')
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
    const meta = new Map([['a', { domain: 'a.com', productCount: 140, pctPrice: 95, updatedAt: NOW - 5_000, lastPassAt: NOW - 5_000, lastPassPages: 20, lastPassProducts: 40 }]])
    const rows = buildScrapeRows(report, meta, NOW)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ domain: 'a.com', products: 140, pctPrice: 95, matched: 12, live: true, status: 'live' })
  })

  it('ne déclare EN COURS que le site le plus récent (le node Comparer réécrit tout d’un coup)', () => {
    // Signature d'une passe « Comparer » : toutes les métas rafraîchies en quelques secondes.
    const meta = new Map([
      ['a', { domain: 'a.com', productCount: 100, updatedAt: NOW - 3_000, lastPassAt: NOW - 600_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['b', { domain: 'b.com', productCount: 50, updatedAt: NOW - 2_000, lastPassAt: NOW - 600_000, lastPassPages: 20, lastPassProducts: 40 }],
      ['c', { domain: 'c.com', productCount: 10, updatedAt: NOW - 1_000, lastPassAt: NOW - 600_000, lastPassPages: 20, lastPassProducts: 40 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW)
    expect(rows.filter((r) => r.live).map((r) => r.domain)).toEqual(['c.com'])
    expect(countByStatus(rows).live).toBe(1)
  })

  it('ajoute un site présent en LIVE seulement et trie ce qui bouge d’abord', () => {
    const meta = new Map([
      ['b', { domain: 'b.com', productCount: 5, updatedAt: NOW - 1_000, lastPassAt: NOW - 1_000, lastPassPages: 3, lastPassProducts: 5 }],
      ['a', { domain: 'a.com', productCount: 300, updatedAt: NOW - 3 * LIVE_WINDOW_MS, lastPassAt: NOW - 3 * LIVE_WINDOW_MS, lastPassPages: 0, lastPassProducts: 0 }],
    ])
    const rows = buildScrapeRows(report, meta, NOW)
    expect(rows.map((r) => r.domain)).toEqual(['b.com', 'a.com'])
    expect(countByStatus(rows)).toMatchObject({ live: 1, error: 1 })
  })
})
