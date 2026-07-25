// src/features/priceWatch/sourceSites.test.ts
import { describe, it, expect } from 'vitest'
import {
  rowsToCompetitorSites, isSourceSitesPayload, resolveSitesInput, importSitesIntoRows, normalizeDomain, deriveWatchId, siteStatus, siteStatusRank, type SourceSiteRow, splitPageBudget,
} from './sourceSites'

describe('normalizeDomain', () => {
  it('retire le protocole et le chemin', () => {
    expect(normalizeDomain(' https://www.kramp.com/shop-fr/fr ')).toBe('www.kramp.com')
    expect(normalizeDomain('pro-motoculture.com')).toBe('pro-motoculture.com')
  })
})

describe('rowsToCompetitorSites', () => {
  const rows: SourceSiteRow[] = [
    { domain: 'https://www.jardimax.com/', enabled: true },
    { domain: 'amazon.fr', enabled: false },
    { domain: 'progarden.fr', enabled: true, fields: 'price, stock' },
    { domain: 'www.jardimax.com', enabled: true }, // doublon du 1er
    { domain: 'rubix.fr', enabled: true, engine: 'brightdata' },
    { domain: 'net-motoculture.fr', enabled: true, engine: 'auto' },
  ]

  it('exclut les désactivés, déduplique, parse les champs', () => {
    const sites = rowsToCompetitorSites(rows)
    expect(sites.map((s) => s.domain)).toEqual([
      'www.jardimax.com', 'progarden.fr', 'rubix.fr', 'net-motoculture.fr',
    ])
    expect(sites[0].fields).toEqual(['price'])
    expect(sites[1].fields).toEqual(['price', 'stock'])
  })

  it("porte le moteur forcé mais omet 'auto' (défaut implicite)", () => {
    const sites = rowsToCompetitorSites(rows)
    expect(sites.find((s) => s.domain === 'rubix.fr')?.engine).toBe('brightdata')
    expect(sites.find((s) => s.domain === 'net-motoculture.fr')?.engine).toBeUndefined()
  })

  it('ignore un moteur inconnu (config corrompue)', () => {
    const sites = rowsToCompetitorSites([{ domain: 'a.fr', enabled: true, engine: 'warp' }])
    expect(sites[0].engine).toBeUndefined()
  })
})

describe('isSourceSitesPayload', () => {
  it('accepte un payload valide, rejette le reste', () => {
    expect(isSourceSitesPayload({ watchId: 'w', sites: [] })).toBe(true)
    expect(isSourceSitesPayload({ watchId: '', sites: [] })).toBe(false)
    expect(isSourceSitesPayload({ sites: [] })).toBe(false)
    expect(isSourceSitesPayload(null)).toBe(false)
    expect(isSourceSitesPayload('www.a.fr')).toBe(false)
  })
})

describe('resolveSitesInput', () => {
  const fallback = { sitesText: 'a.fr\nb.fr', watchIdRaw: '', workflowId: 'wf_123' }

  it('priorité au payload du port (sites ET watchId)', () => {
    const r = resolveSitesInput(
      { watchId: 'suivi_partage', sites: [{ id: 'c_fr', domain: 'c.fr' }] },
      fallback,
    )
    expect(r.fromPort).toBe(true)
    expect(r.watchId).toBe('suivi_partage')
    expect(r.sites.map((s) => s.domain)).toEqual(['c.fr'])
  })

  it('repli sur la config locale si le port est absent ou invalide', () => {
    for (const input of [undefined, null, {}, { watchId: '', sites: [] }]) {
      const r = resolveSitesInput(input, fallback)
      expect(r.fromPort).toBe(false)
      expect(r.watchId).toBe(deriveWatchId('', 'wf_123'))
      expect(r.sites.map((s) => s.domain)).toEqual(['a.fr', 'b.fr'])
    }
  })

  it('le watchId manuel du fallback est respecté (dérivation historique)', () => {
    const r = resolveSitesInput(undefined, { ...fallback, watchIdRaw: 'Mon Suivi' })
    expect(r.watchId).toBe(deriveWatchId('Mon Suivi', 'wf_123'))
  })
})

describe('siteStatus + tri', () => {
  it('désactivé prime sur tout historique', () => {
    expect(siteStatus({ enabled: false, live: true, lastPassAt: 1, lastPassPages: 9, lastPassProducts: 9 })).toBe('disabled')
  })
  it('en cours > échec > sans produit > OK > jamais', () => {
    expect(siteStatus({ enabled: true, live: true })).toBe('live')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 0 })).toBe('error')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 5, lastPassProducts: 0 })).toBe('empty')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 5, lastPassProducts: 3 })).toBe('ok')
    expect(siteStatus({ enabled: true, live: false })).toBe('never')
  })
  it('les rangs ordonnent live<error<empty<ok<never<disabled', () => {
    const order = (['live', 'error', 'empty', 'ok', 'never', 'disabled'] as const).map(siteStatusRank)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('importSitesIntoRows', () => {
  it('ajoute les nouveaux domaines en préservant l\'état des existants', () => {
    const existing: SourceSiteRow[] = [{ domain: 'amazon.fr', enabled: false, engine: 'brightdata' }]
    const rows = importSitesIntoRows('https://www.jardimax.com/\nhttp://amazon.fr/\nprogarden.fr | price, stock', existing)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ domain: 'amazon.fr', enabled: false, engine: 'brightdata' }) // intact
    expect(rows[1].domain).toBe('www.jardimax.com')
    expect(rows[1].enabled).toBe(true)
    expect(rows[2].fields).toBe('price, stock')
  })
})

describe('splitPageBudget', () => {
  const s = (id: string, pageBudget?: number) => ({ id, pageBudget })

  it('sert d’abord les budgets réservés, partage le reste', () => {
    const b = splitPageBudget([s('cher', 10), s('a'), s('b')], 100)
    expect(b.get('cher')).toBe(10)
    expect(b.get('a')).toBe(45)
    expect(b.get('b')).toBe(45)
  })

  it('bride vraiment un concurrent coûteux (cas Bright Data)', () => {
    // Avant : 500/12 = 41 pages pour tout le monde, y compris le site facturé à la requête.
    const sites = [s('leroymerlin', 5), ...Array.from({ length: 11 }, (_, i) => s(`ps${i}`))]
    const b = splitPageBudget(sites, 500)
    expect(b.get('leroymerlin')).toBe(5)
    expect(b.get('ps0')).toBe(45)
  })

  it('garantit au moins 1 page par site', () => {
    const b = splitPageBudget([s('a'), s('b'), s('c')], 2)
    expect([...b.values()]).toEqual([1, 1, 1])
  })

  it('ne rogne pas un budget explicite plus grand que le total (choix assumé)', () => {
    const b = splitPageBudget([s('gros', 80), s('autre')], 50)
    expect(b.get('gros')).toBe(80)
    expect(b.get('autre')).toBe(1)
  })
})
