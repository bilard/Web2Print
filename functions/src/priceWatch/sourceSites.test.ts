// functions/src/priceWatch/sourceSites.test.ts
// Parité SERVEUR du module « Sites sources ». Le jumeau serveur avait perdu deux champs
// de la ligne de config (`auth`, `pageBudget`) : le cron partageait donc le budget de
// pages à parts égales alors qu'un concurrent coûteux était explicitement bridé dans
// l'UI. Ces tests verrouillent la propagation de bout en bout (ligne → site → budget).
import { describe, it, expect } from 'vitest'
import { rowsToCompetitorSites, sitesForRole, splitPageBudget, type SourceSiteRow } from './sourceSites'

describe('rowsToCompetitorSites (jumeau serveur)', () => {
  const rows: SourceSiteRow[] = [
    { domain: 'https://www.jardimax.com/', enabled: true, engine: 'jina' },
    { domain: 'amazon.fr', enabled: false },
    { domain: 'progarden.fr', enabled: true, fields: 'price, stock', auth: true },
    { domain: 'www.jardimax.com', enabled: true }, // doublon du 1er
    { domain: 'www.leroymerlin.fr', enabled: true, engine: 'brightdata', pageBudget: 5 },
  ]

  it('⚠⚠ ÉMET les désactivés, marqués — le comparatif lit leur index d’hier', () => {
    // Ils étaient purement absents du flux : décocher un concurrent effaçait ses milliers
    // de fiches du rapport. `sitesForRole` les écarte de la collecte, pas du comparatif.
    const sites = rowsToCompetitorSites(rows)
    expect(sites.some((s) => s.enabled === false)).toBe(true)
    expect(sitesForRole(sites, 'harvest').map((s) => s.domain)).toEqual([
      'www.jardimax.com', 'progarden.fr', 'www.leroymerlin.fr',
    ])
    const actifs = sites.filter((s) => s.enabled !== false)
    expect(actifs[0].fields).toEqual(['price'])
    expect(actifs[1].fields).toEqual(['price', 'stock'])
  })

  it('porte le moteur forcé, le drapeau auth et le budget réservé', () => {
    const sites = rowsToCompetitorSites(rows)
    expect(sites.find((s) => s.domain === 'www.leroymerlin.fr')?.engine).toBe('brightdata')
    expect(sites.find((s) => s.domain === 'progarden.fr')?.auth).toBe(true)
    expect(sites.find((s) => s.domain === 'www.leroymerlin.fr')?.pageBudget).toBe(5)
  })

  it('ignore un budget non numérique ou nul (config corrompue)', () => {
    const sites = rowsToCompetitorSites([
      { domain: 'a.fr', enabled: true, pageBudget: 0 },
      { domain: 'b.fr', enabled: true, pageBudget: undefined },
      { domain: 'c.fr', enabled: true, pageBudget: Number.NaN },
    ])
    expect(sites.every((s) => s.pageBudget === undefined)).toBe(true)
  })

  it('porte le canal de relevé et ignore une valeur inconnue', () => {
    const sites = rowsToCompetitorSites([
      { domain: 'a.fr', enabled: true, mode: 'directed' },
      { domain: 'b.fr', enabled: true, mode: 'harvest' },
      { domain: 'c.fr', enabled: true, mode: 'both' }, // valeur hors liste → les deux
      { domain: 'd.fr', enabled: true },
    ])
    expect(sites.map((s) => s.mode)).toEqual(['directed', 'harvest', undefined, undefined])
  })

  it('le budget réservé survit jusqu’à la répartition (cas leroymerlin en prod)', () => {
    // 15 sites actifs, budget global 500 : sans propagation, le site bridé recevait
    // 33 pages (500 ÷ 15) au lieu des 5 réservées — 7,4 min de cycle en Bright Data.
    const rows15: SourceSiteRow[] = Array.from({ length: 14 }, (_, i) => ({ domain: `s${i}.fr`, enabled: true }))
    rows15.push({ domain: 'www.leroymerlin.fr', enabled: true, engine: 'brightdata', pageBudget: 5 })
    const budgets = splitPageBudget(rowsToCompetitorSites(rows15), 500)
    expect(budgets.get('www.leroymerlin.fr')).toBe(5)
    expect(budgets.get('s0.fr')).toBe(35) // (500 − 5) ÷ 14
  })
})

describe('sitesForRole', () => {
  const sites = [
    { id: 'a', mode: 'directed' as const },
    { id: 'b', mode: 'harvest' as const },
    { id: 'c' }, // sans mode = les deux canaux (rétrocompatibilité)
  ]

  it('la moisson ignore les sites en recherche dirigée seule', () => {
    expect(sitesForRole(sites, 'harvest').map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('la recherche dirigée ignore les sites en moisson seule', () => {
    expect(sitesForRole(sites, 'directed').map((s) => s.id)).toEqual(['a', 'c'])
  })
})
