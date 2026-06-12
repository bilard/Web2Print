import { describe, it, expect } from 'vitest'
import { buildQueries, mergePlannedResults } from './searchPlanner'

describe('buildQueries', () => {
  it('génère une requête site: par enseigne demandée', () => {
    const qs = buildQueries('tondeuse Honda électrique', ['leroymerlin.fr', 'castorama.fr', 'jardiland.com'])
    expect(qs).toEqual([
      { query: 'site:leroymerlin.fr tondeuse Honda électrique', site: 'leroymerlin.fr' },
      { query: 'site:castorama.fr tondeuse Honda électrique', site: 'castorama.fr' },
      { query: 'site:jardiland.com tondeuse Honda électrique', site: 'jardiland.com' },
    ])
  })

  it('retombe sur une requête générique sans site demandé', () => {
    expect(buildQueries('perceuse Makita 18V', [])).toEqual([{ query: 'perceuse Makita 18V' }])
  })

  it('normalise les domaines (www., casse, espaces)', () => {
    const qs = buildQueries('x', [' WWW.LeroyMerlin.fr '])
    expect(qs).toEqual([{ query: 'site:leroymerlin.fr x', site: 'leroymerlin.fr' }])
  })
})

describe('mergePlannedResults', () => {
  const r = (url: string, title = url) => ({ url, title })

  it('équilibre les résultats entre sites (round-robin) et marque onTarget', () => {
    const merged = mergePlannedResults([
      { site: 'a.fr', results: [r('https://a.fr/p1'), r('https://a.fr/p2')] },
      { site: 'b.fr', results: [r('https://b.fr/p1'), r('https://b.fr/p2')] },
    ], 3)
    expect(merged.map((m) => m.url)).toEqual(['https://a.fr/p1', 'https://b.fr/p1', 'https://a.fr/p2'])
    expect(merged.every((m) => m.onTarget)).toBe(true)
  })

  it('rejette les résultats hors du site demandé (site: non respecté par le moteur)', () => {
    const merged = mergePlannedResults([
      { site: 'leroymerlin.fr', results: [r('https://www.leroymerlin.fr/p1'), r('https://facebook.com/x'), r('https://autre.fr/p')] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual(['https://www.leroymerlin.fr/p1'])
  })

  it('filtre les domaines junk sur une requête générique et déduplique', () => {
    const merged = mergePlannedResults([
      { results: [r('https://youtube.com/watch?v=1'), r('https://reddit.com/r/x'), r('https://shop.fr/p1'), r('https://shop.fr/p1')] },
    ], 10)
    expect(merged.map((m) => m.url)).toEqual(['https://shop.fr/p1'])
    expect(merged[0].onTarget).toBe(false)
  })

  it('tronque au limit demandé', () => {
    const merged = mergePlannedResults([
      { results: [r('https://a.fr/1'), r('https://a.fr/2'), r('https://a.fr/3')] },
    ], 2)
    expect(merged).toHaveLength(2)
  })
})
