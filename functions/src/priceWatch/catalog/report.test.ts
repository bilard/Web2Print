// functions/src/priceWatch/catalog/report.test.ts
// Parité SERVEUR de buildReport/rankProducts (jumeau du test client). Prouve que le
// rapport écrit par le cron est identique à celui du client sur les mêmes entrées.
import { describe, it, expect } from 'vitest'
import { buildReport, rankProducts, auditListings, type ProductRow , type CompetitorAudit } from './report'
import type { SiteRef } from './matrix'
import type { SourceProduct } from './match'
import type { CompetitorListing } from './competitorListing'

const sites: SiteRef[] = [
  { siteId: 'pm', domain: 'pro-motoculture.com' },
  { siteId: 'wm', domain: 'webmotoculture.com' },
]

// ⚠ Libellés RÉALISTES : l'appariement exige que le nom corrobore la référence.
const listing = (o: Partial<CompetitorListing>): CompetitorListing => ({ url: 'https://x.fr/p.html', name: 'Produit', ...o })

describe('buildReport (serveur)', () => {
  const products: SourceProduct[] = [
    { id: 'a', name: 'Alternateur', ref: 'BS691991', price: 100 },
    { id: 'b', name: 'Courroie', ref: 'F1633', price: 5 },
    { id: 'c', name: 'Vis', price: 1 },
  ]
  const index = new Map<string, CompetitorListing[]>([
    ['pm', [listing({ ref: 'BS691991', price: 96, availability: 'in-stock', url: 'https://pm.fr/a.html', name: 'Alternateur Briggs 691991' })]],
    ['wm', [listing({ ref: 'F1633', price: 11.7, url: 'https://wm.fr/b.html', name: 'Courroie trapézoïdale F1633' })]],
  ])
  const r = buildReport(products, sites, index)

  it('compte les produits appariés et les positions', () => {
    expect(r.kpis.products).toBe(2)
    expect(r.kpis.comparisons).toBe(2)
    expect(r.kpis.cheaperThanMe).toBe(1)
    expect(r.kpis.dearerThanMe).toBe(1)
    expect(r.kpis.productsUndercut).toBe(1)
  })

  it('détecte un concurrent moins cher que moi (alerte)', () => {
    const a = r.products.find((p) => p.id === 'a')!
    expect(a.undercut).toBe(true)
    expect(a.bestGapPct).toBeLessThan(0)
    expect(a.competitors[0].priceHt).toBe(80)
    expect(a.competitors[0].match).toBe('exact-ref')
  })

  it('agrège des stats par concurrent (alimente comp[] de l’historique)', () => {
    const pm = r.byCompetitor.find((c) => c.siteId === 'pm')!
    expect(pm.matched).toBe(1)
    expect(pm.cheaper).toBe(1)
    expect(pm.avgGapPct).toBeLessThan(0)
  })

  it('distingue appariement exact et pièce d’origine', () => {
    const src: SourceProduct[] = [
      { id: 'adapt', name: 'Lame adaptable', ref: '1100010', originRefs: ['532134149'], price: 7 },
    ]
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: '532134149', price: 30, url: 'https://pm.fr/oem.html', name: 'Lame de tondeuse HUSQVARNA' })]],
      ['wm', []],
    ])
    const rr = buildReport(src, sites, idx)
    expect(rr.kpis.matchedOriginOnly).toBe(1)
    expect(rr.products[0].competitors[0].match).toBe('origin')
  })
})

describe('rankProducts (serveur)', () => {
  it('classe les produits les plus sous-cotés en tête', () => {
    const rows: ProductRow[] = [
      { id: '1', name: 'A', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: -5, undercut: true },
      { id: '2', name: 'B', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: -40, undercut: true },
      { id: '3', name: 'C', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: 12, undercut: false },
    ]
    expect(rankProducts(rows).map((r) => r.id)).toEqual(['2', '1', '3'])
  })
})

describe('auditListings (serveur)', () => {
  it('calcule les taux de remplissage', () => {
    const l = (o: Partial<CompetitorListing>): CompetitorListing => ({ url: 'u', name: 'n', ...o })
    const audit: CompetitorAudit = auditListings([
      l({ price: 10, listPrice: 12, availability: 'in-stock', image: 'i', ref: 'R1' }),
      l({ price: 20, name: '', ref: 'R2' }),
      l({ ref: 'R3' }),
    ])
    expect(audit.indexed).toBe(3)
    expect(audit.pctPrice).toBe(67)
    expect(audit.pctRef).toBe(100)
  })
})
