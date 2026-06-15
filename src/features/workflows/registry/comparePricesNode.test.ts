// src/features/workflows/registry/comparePricesNode.test.ts
import { describe, it, expect } from 'vitest'
import { pivotCompare, type CompareFields } from './comparePricesNode'

const FIELDS: CompareFields = {
  keyColumn: 'ean', fallbackKeyColumn: 'name', siteColumn: 'site',
  priceColumn: 'price', labelColumn: 'name', onlyCommon: true,
}

describe('pivotCompare', () => {
  const rows = [
    { site: 'jardiland.com', name: 'Tondeuse RLM18E40H', ean: '4892210822604', price: '208,99 €' },
    { site: 'castorama.fr', name: 'Tondeuse RLM18E40H 1800W 40cm', ean: '4892210822604', price: '208,99' },
    { site: 'jardiland.com', name: 'Tondeuse RLM15E36H', ean: '4892210822567', price: '169,00 €' },
    { site: 'castorama.fr', name: 'Tondeuse RLM15E36H 1500W', ean: '4892210822567', price: '149,99' },
    { site: 'jardiland.com', name: 'Produit unique', ean: '0000000000001', price: '50' },
  ]

  it('apparie par EAN et calcule l’écart €/% + le moins cher', () => {
    const { rows: out, sites, compared } = pivotCompare(rows, FIELDS)
    expect(sites).toEqual(['jardiland.com', 'castorama.fr'])
    expect(compared).toBe(2)
    // onlyCommon → le produit présent sur un seul site est exclu
    expect(out).toHaveLength(2)
    // Tri par écart % décroissant → RLM15E36H (169 vs 149,99) en tête
    expect(out[0]).toMatchObject({
      ean: '4892210822567',
      prix_jardiland_com: '169',
      prix_castorama_fr: '149.99',
      ecart_eur: '19.01',
      moins_cher: 'castorama.fr',
    })
    expect(Number(out[0].ecart_pct)).toBeCloseTo(12.7, 1)
    // Prix égaux → écart 0, égalité
    expect(out[1]).toMatchObject({ ean: '4892210822604', ecart_eur: '0', moins_cher: 'égalité' })
  })

  it('conserve le libellé le plus informatif (le plus long)', () => {
    const { rows: out } = pivotCompare(rows, FIELDS)
    const rlm18 = out.find((r) => r.ean === '4892210822604')
    expect(rlm18?.produit).toBe('Tondeuse RLM18E40H 1800W 40cm')
  })

  it('onlyCommon=false garde aussi les produits mono-site', () => {
    const { rows: out } = pivotCompare(rows, { ...FIELDS, onlyCommon: false })
    expect(out).toHaveLength(3)
    const solo = out.find((r) => r.ean === '0000000000001')
    expect(solo).toMatchObject({ ecart_eur: '', moins_cher: 'seul jardiland.com' })
  })

  it('repli sur le nom normalisé quand l’EAN est absent', () => {
    const noEan = [
      { site: 'a.com', name: 'Tondeuse X', ean: '', price: '100' },
      { site: 'b.com', name: 'tondeuse  x', ean: '', price: '120' },
    ]
    const { rows: out, compared } = pivotCompare(noEan, FIELDS)
    expect(compared).toBe(1)
    expect(out[0]).toMatchObject({ prix_a_com: '100', prix_b_com: '120', moins_cher: 'a.com' })
  })
})
