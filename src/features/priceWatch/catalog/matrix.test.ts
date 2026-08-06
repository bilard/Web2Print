import { describe, it, expect } from 'vitest'
import { buildMatrix, type SiteRef } from './matrix'
import type { SourceProduct } from './match'
import type { CompetitorListing } from './prestashop'

const sites: SiteRef[] = [
  { siteId: 'pm', domain: 'pro-motoculture.com' },
  { siteId: 'wm', domain: 'webmotoculture.com' },
]

const products: SourceProduct[] = [
  { id: 'a', name: 'Alternateur Briggs', ref: 'BS691991', ean: '3582321853475', price: 80 },
  { id: 'b', name: 'Courroie A35', ref: 'F1633', price: 9.75 },
  { id: 'c', name: 'Vis sans clé', price: 1 }, // aucune clé exploitable
]

const listing = (o: Partial<CompetitorListing>): CompetitorListing =>
  ({ url: 'https://x.fr/p.html', name: 'x', ...o })

const index = new Map<string, CompetitorListing[]>([
  ['pm', [listing({ ref: 'BS691991', price: 98, availability: 'in-stock', url: 'https://pm.fr/a.html', name: 'Alternateur Briggs & Stratton' })]],
  ['wm', [listing({ ref: 'F1633', price: 11.7, url: 'https://wm.fr/b.html', name: 'Courroie trapézoïdale A35' })]],
])

describe('buildMatrix', () => {
  const m = buildMatrix(products, sites, index)

  it('produit les colonnes fixes + un bloc par concurrent', () => {
    expect(m.columns.map((c) => c.key)).toContain('mon_prix_ht')
    expect(m.columns.map((c) => c.key)).toContain('prix_ttc_pro_motoculture_com')
    expect(m.columns.map((c) => c.key)).toContain('url_webmotoculture_com')
  })

  it('compte appariés / non appariés / sans clé', () => {
    expect(m.matched).toBe(2) // a chez pm, b chez wm
    expect(m.noKey).toBe(1)   // c
    expect(m.unmatched).toBe(0)
  })

  it('n’inclut que les produits appariés par défaut', () => {
    expect(m.rows).toHaveLength(2)
    expect(m.rows.map((r) => r.reference).sort()).toEqual(['BS691991', 'F1633'])
  })

  it('remplit TTC verbatim et HT recalculé du bon concurrent', () => {
    const a = m.rows.find((r) => r.reference === 'BS691991')!
    expect(a.prix_ttc_pro_motoculture_com).toBe(98)
    expect(a.prix_ht_pro_motoculture_com).toBe(81.67)
    expect(a.stock_pro_motoculture_com).toBe('En stock')
    expect(a.url_pro_motoculture_com).toBe('https://pm.fr/a.html')
    // Pas de correspondance chez webmotoculture → colonnes vides.
    expect(a.prix_ttc_webmotoculture_com).toBe('')
  })

  it('calcule l’écart en pourcentage', () => {
    const a = m.rows.find((r) => r.reference === 'BS691991')!
    // mon 80 HT vs 81,67 HT concurrent → +2,1 %
    expect(a.ecart_pro_motoculture_com).toBeCloseTo(2.1, 1)
  })

  it('peut inclure aussi les produits non appariés', () => {
    const full = buildMatrix(products, sites, index, { matchedOnly: false })
    expect(full.rows).toHaveLength(3)
  })

  it('remonte le nom et l’image du produit concurrent (vérification visuelle)', () => {
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [listing({ ref: 'BS691991', price: 98, name: 'Alternateur Briggs 691991', image: 'https://pm.fr/img/a.jpg', url: 'https://pm.fr/a.html' })]],
      ['wm', []],
    ])
    const r = buildMatrix([products[0]], sites, idx)
    const row = r.rows[0]
    expect(row.nom_pro_motoculture_com).toBe('Alternateur Briggs 691991')
    expect(row.image_pro_motoculture_com).toBe('https://pm.fr/img/a.jpg')
  })

  it('utilise les noms de colonnes de la source dans les en-têtes', () => {
    const r = buildMatrix(products, sites, index, {
      labels: { name: 'DESIGNATION', ref: 'CODE_ARTICLE', ean: 'GENCOD', price: 'PV_HT' },
    })
    const byKey = new Map(r.columns.map((c) => [c.key, c.label]))
    expect(byKey.get('produit')).toBe('DESIGNATION')
    expect(byKey.get('reference')).toBe('CODE_ARTICLE')
    expect(byKey.get('ean')).toBe('GENCOD')
    expect(byKey.get('mon_prix_ht')).toBe('PV_HT')
    // Colonnes concurrent : nom source suffixé du domaine.
    expect(byKey.get('nom_pro_motoculture_com')).toBe('DESIGNATION — pro-motoculture.com')
    expect(byKey.get('prix_ht_pro_motoculture_com')).toBe('PV_HT — pro-motoculture.com')
  })

  it('distingue un match « même produit » d’un match « pièce d’origine »', () => {
    const src: SourceProduct[] = [
      { id: 'exact', name: 'Lame', ref: 'BS691991', price: 50 },
      { id: 'adapt', name: 'Lame adaptable', ref: '1100010', originRefs: ['532134149'], price: 7 },
    ]
    const idx = new Map<string, CompetitorListing[]>([
      ['pm', [
        listing({ ref: 'BS691991', price: 60, url: 'https://pm.fr/e.html', name: 'Lame de coupe BS691991' }),
        listing({ ref: '532134149', price: 30, url: 'https://pm.fr/oem.html', name: 'Lame de tondeuse HUSQVARNA' }),
      ]],
      ['wm', []],
    ])
    const r = buildMatrix(src, sites, idx)
    expect(r.matchedExact).toBe(1)
    expect(r.matchedOriginOnly).toBe(1)
    const exact = r.rows.find((x) => x.reference === 'BS691991')!
    const adapt = r.rows.find((x) => x.reference === '1100010')!
    expect(exact.match_pro_motoculture_com).toBe('Référence')
    expect(adapt.match_pro_motoculture_com).toBe('Pièce d’origine')
  })
})
