import { describe, it, expect } from 'vitest'
import { buildReport, rankProducts, auditListings, type ProductRow, type CompetitorAudit } from './report'
import type { SiteRef } from './matrix'
import type { SourceProduct } from './match'
import type { CompetitorListing } from './prestashop'

const sites: SiteRef[] = [
  { siteId: 'pm', domain: 'pro-motoculture.com' },
  { siteId: 'wm', domain: 'webmotoculture.com' },
]

const listing = (o: Partial<CompetitorListing>): CompetitorListing => ({ url: 'https://x.fr/p.html', name: 'x', ...o })

describe('buildReport', () => {
  const products: SourceProduct[] = [
    // Mon prix 100 HT ; pm affiche 96 TTC → 80 HT → concurrent MOINS cher (alerte).
    { id: 'a', name: 'Alternateur', ref: 'BS691991', price: 100 },
    // Mon prix 5 HT ; wm affiche 11,70 TTC → 9,75 HT → JE suis moins cher.
    { id: 'b', name: 'Courroie', ref: 'F1633', price: 5 },
    // Aucune clé exploitable.
    { id: 'c', name: 'Vis', price: 1 },
  ]
  const index = new Map<string, CompetitorListing[]>([
    ['pm', [listing({ ref: 'BS691991', price: 96, availability: 'in-stock', url: 'https://pm.fr/a.html', name: 'Alt 691991' })]],
    ['wm', [listing({ ref: 'F1633', price: 11.7, url: 'https://wm.fr/b.html' })]],
  ])
  const r = buildReport(products, sites, index)

  it('compte les produits appariés et les positions', () => {
    expect(r.kpis.products).toBe(2)
    expect(r.kpis.comparisons).toBe(2)
    expect(r.kpis.cheaperThanMe).toBe(1)   // pm sur A
    expect(r.kpis.dearerThanMe).toBe(1)    // wm sur B (je suis moins cher)
    expect(r.kpis.productsUndercut).toBe(1)
  })

  it('détecte un concurrent moins cher que moi (alerte)', () => {
    const a = r.products.find((p) => p.id === 'a')!
    expect(a.undercut).toBe(true)
    expect(a.bestGapPct).toBeLessThan(0)
    expect(a.competitors[0].priceHt).toBe(80)
    expect(a.competitors[0].match).toBe('exact-ref')
  })

  it('n’alerte pas quand je suis moins cher', () => {
    const b = r.products.find((p) => p.id === 'b')!
    expect(b.undercut).toBe(false)
    expect(b.bestGapPct).toBeGreaterThan(0)
  })

  it('agrège des stats par concurrent', () => {
    const pm = r.byCompetitor.find((c) => c.siteId === 'pm')!
    expect(pm.matched).toBe(1)
    expect(pm.cheaper).toBe(1)
    expect(pm.avgGapPct).toBeLessThan(0)
    const wm = r.byCompetitor.find((c) => c.siteId === 'wm')!
    expect(wm.cheaper).toBe(0)
  })

  it('compte les ruptures concurrent', () => {
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: 'BS691991', price: 96, availability: 'out-of-stock', url: 'https://pm.fr/a.html' })]],
      ['wm', []],
    ])
    const rr = buildReport([products[0]], sites, idx)
    expect(rr.kpis.ruptures).toBe(1)
    expect(rr.byCompetitor.find((c) => c.siteId === 'pm')!.ruptures).toBe(1)
  })

  it('calcule l’indice tarif base 100 (médiane des ratios)', () => {
    // A : mon prix 100 vs marché 80 → 125. B : mon prix 5 vs marché 9,75 → 51,3.
    // Médiane de deux valeurs = leur moyenne → 88,1.
    expect(r.kpis.priceIndex).toBeCloseTo(88.1, 1)
    expect(r.kpis.priceIndexBest).toBeCloseTo(88.1, 1) // un seul concurrent chiffré par produit
  })

  it('indice > 100 quand je suis au-dessus du marché', () => {
    const src: SourceProduct[] = [{ id: 'a', name: 'Alt', ref: 'BS691991', price: 120 }]
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: 'BS691991', price: 120, url: 'https://pm.fr/a.html' })]], // 100 HT
      ['wm', []],
    ])
    expect(buildReport(src, sites, idx).kpis.priceIndex).toBe(120)
  })

  it('l’indice vs le + bas est plus sévère que vs la médiane', () => {
    const src: SourceProduct[] = [{ id: 'a', name: 'Alt', ref: 'BS691991', price: 100 }]
    // Concurrents : 96 et 60 TTC → 80 et 50 HT. Médiane 65, min 50.
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: 'BS691991', price: 96, url: 'https://pm.fr/a.html' })]],
      ['wm', [listing({ ref: 'BS691991', price: 60, url: 'https://wm.fr/a.html' })]],
    ])
    const rr = buildReport(src, sites, idx)
    expect(rr.kpis.priceIndex).toBeGreaterThan(100)
    expect(rr.kpis.priceIndexBest!).toBeGreaterThan(rr.kpis.priceIndex!)
  })

  it('ignore les produits sans prix exploitable (pas de division par zéro)', () => {
    const src: SourceProduct[] = [{ id: 'a', name: 'Alt', ref: 'BS691991', price: 0 }]
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: 'BS691991', price: 96, url: 'https://pm.fr/a.html' })]],
      ['wm', []],
    ])
    expect(buildReport(src, sites, idx).kpis.priceIndex).toBeNull()
  })

  it('distingue appariement exact et pièce d’origine', () => {
    const src: SourceProduct[] = [
      { id: 'adapt', name: 'Lame adaptable', ref: '1100010', originRefs: ['532134149'], price: 7 },
    ]
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: '532134149', price: 30, url: 'https://pm.fr/oem.html' })]],
      ['wm', []],
    ])
    const rr = buildReport(src, sites, idx)
    expect(rr.kpis.matchedOriginOnly).toBe(1)
    expect(rr.kpis.matchedExact).toBe(0)
    expect(rr.products[0].competitors[0].match).toBe('origin')
  })
})

describe('rankProducts', () => {
  it('classe les produits les plus sous-cotés en tête', () => {
    const rows: ProductRow[] = [
      { id: '1', name: 'A', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: -5, undercut: true },
      { id: '2', name: 'B', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: -40, undercut: true },
      { id: '3', name: 'C', reference: null, ean: null, famille: null, myPriceHt: null, sourceUrl: null, competitors: [], bestGapPct: 12, undercut: false },
    ]
    expect(rankProducts(rows).map((r) => r.id)).toEqual(['2', '1', '3'])
  })
})

describe('auditListings', () => {
  it('calcule les taux de remplissage des champs collectés', () => {
    const l = (o: Partial<CompetitorListing>): CompetitorListing => ({ url: 'u', name: 'n', ...o })
    const audit: CompetitorAudit = auditListings([
      l({ price: 10, listPrice: 12, availability: 'in-stock', image: 'i', ref: 'R1' }),
      l({ price: 20, name: '', ref: 'R2' }), // pas de nom, pas d'image, pas de barré
      l({ ref: 'R3', name: '' }), // ni prix ni rien, pas de nom
    ])
    expect(audit.indexed).toBe(3)
    expect(audit.pctPrice).toBe(67)     // 2/3
    expect(audit.pctListPrice).toBe(33) // 1/3
    expect(audit.pctName).toBe(33)      // seul le 1er a un nom non vide
    expect(audit.pctRef).toBe(100)      // 3/3
  })
  it('renvoie des taux à 0 pour un site sans fiche collectée', () => {
    expect(auditListings([]).indexed).toBe(0)
    expect(auditListings([]).pctPrice).toBe(0)
  })
})
