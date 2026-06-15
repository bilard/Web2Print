// src/features/workflows/registry/comparePricesNode.test.ts
import { describe, it, expect } from 'vitest'
import { compareSourceToCompetitors, extractReference, normName } from './comparePricesNode'

const CFG = {
  nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
  referenceColumn: '', siteColumn: 'site', onlyMatched: false,
}

describe('extractReference', () => {
  it('déduit le code modèle et ignore les unités', () => {
    expect(extractReference('Tondeuse Electrique RYOBI RLM18E40H 1800W 40cm de coupe')).toBe('RLM18E40H')
    expect(extractReference('Tondeuse RYOBI 36V RY36LMXSP53A-160')).toBe('RY36LMXSP53A160')
    expect(extractReference('Tondeuse électrique 1800 W 40 cm')).toBe('') // pas de vrai code
  })
})

describe('normName', () => {
  it('ignore casse et accents', () => {
    expect(normName('Tondeuse électrique')).toBe(normName('Tondeuse Electrique'))
  })
})

describe('compareSourceToCompetitors', () => {
  const source = [
    { site: 'jardiland.com', name: 'Tondeuse électrique RLM18E40H 1800W', ean: '4892210822604', price: '208,99 €' },
    { site: 'jardiland.com', name: 'Tondeuse RLM15E36H 1500W', ean: '', price: '169,00 €' },
    { site: 'jardiland.com', name: 'Produit exclusif Jardiland', ean: '', price: '99,00 €' },
  ]
  const competitors = [
    { site: 'castorama.fr', name: 'Tondeuse Electrique RYOBI RLM18E40H 1800W 40cm', ean: '4892210822604', price: '208,99' },
    { site: 'castorama.fr', name: 'Tondeuse RYOBI RLM15E36H 1500W coupe 36cm', ean: '', price: '149,99' },
  ]

  it('garde TOUS les produits source, même non appariés', () => {
    const { rows, matched } = compareSourceToCompetitors(source, competitors, CFG)
    expect(rows).toHaveLength(3) // les 3 produits source
    expect(matched).toBe(2)
    const exclusif = rows.find((r) => r.produit === 'Produit exclusif Jardiland')
    expect(exclusif).toMatchObject({ position: 'non trouvé', prix_concurrent: '' })
  })

  it('apparie par EAN et calcule l’écart + position', () => {
    const { rows } = compareSourceToCompetitors(source, competitors, CFG)
    const rlm18 = rows.find((r) => r.ean === '4892210822604')!
    expect(rlm18).toMatchObject({
      source: 'jardiland.com', prix_source: '208.99',
      prix_castorama_fr: '208.99', prix_concurrent: '208.99',
      ecart_eur: '0', position: 'égalité',
    })
  })

  it('apparie par CODE MODÈLE quand l’EAN manque (RLM15E36H)', () => {
    const { rows } = compareSourceToCompetitors(source, competitors, CFG)
    const rlm15 = rows.find((r) => r.reference === 'RLM15E36H')!
    expect(rlm15).toMatchObject({
      prix_source: '169', prix_castorama_fr: '149.99',
      ecart_eur: '19.01', position: 'plus cher', meilleur_concurrent: 'castorama.fr',
    })
    expect(Number(rlm15.ecart_pct)).toBeCloseTo(12.7, 1)
  })

  it('onlyMatched exclut les produits sans concurrent', () => {
    const { rows } = compareSourceToCompetitors(source, competitors, { ...CFG, onlyMatched: true })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.position !== 'non trouvé')).toBe(true)
  })
})
