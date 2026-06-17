// src/features/workflows/registry/comparePricesNode.test.ts
import { describe, it, expect } from 'vitest'
import { compareSourceToCompetitors, referenceTokens, normName } from './comparePricesNode'

const CFG = {
  nameColumn: 'name', priceColumn: 'price', eanColumn: 'ean',
  referenceColumn: '', urlColumn: 'url', siteColumn: 'site',
  brandColumn: 'brand', originalColumn: 'originalPrice', onlyMatched: false,
}

describe('referenceTokens', () => {
  it('extrait les codes modèle d’un nom et ignore les unités', () => {
    expect(referenceTokens('Tondeuse Electrique RYOBI RLM18E40H 1800W 40cm')).toContain('RLM18E40H')
    expect(referenceTokens('Tondeuse 1800 W 40 cm 18V')).toEqual([]) // que des unités
  })
  it('extrait le code depuis un slug d’URL hyphéné', () => {
    const url = 'https://www.jardiland.com/p/tondeuse-electrique-1800-w-40-cm-rlm18e40h-ryobi-1404817'
    expect(referenceTokens(url)).toContain('RLM18E40H')
  })
})

describe('normName', () => {
  it('ignore casse et accents', () => {
    expect(normName('Tondeuse électrique')).toBe(normName('Tondeuse Electrique'))
  })
})

describe('compareSourceToCompetitors', () => {
  // Cas RÉEL : le nom Jardiland ne contient PAS le code (il est dans l’URL),
  // alors que Castorama le met dans le nom. L’appariement doit passer par l’URL.
  const source = [
    {
      site: 'jardiland.com', name: 'Tondeuse électrique – RYOBI', ean: '',
      url: 'https://www.jardiland.com/p/tondeuse-electrique-1800-w-40-cm-rlm18e40h-ryobi-1404817',
      price: '219,00 €',
    },
    { site: 'jardiland.com', name: 'Produit exclusif Jardiland', ean: '', url: 'https://www.jardiland.com/p/exclusif-123', price: '99,00 €' },
  ]
  const competitors = [
    {
      site: 'castorama.fr', name: 'Tondeuse Electrique RYOBI RLM18E40H 1800W 40cm', ean: '4892210822604',
      url: 'https://www.castorama.fr/mkp/...rlm18e40h.../4892210822604_CAFR.prd', price: '208,99',
    },
  ]

  it('apparie via le code modèle de l’URL quand le nom source ne l’a pas', () => {
    const { rows, matched } = compareSourceToCompetitors(source, competitors, CFG)
    expect(rows).toHaveLength(2) // tous les produits source conservés
    expect(matched).toBe(1)
    const rlm18 = rows.find((r) => r.reference === 'RLM18E40H')!
    expect(rlm18).toMatchObject({
      prix_source: '219', prix_castorama_fr: '208.99',
      ecart_eur: '10.01', position: 'plus cher', meilleur_concurrent: 'castorama.fr',
    })
  })

  it('garde les produits sans concurrent (position « non trouvé »)', () => {
    const { rows } = compareSourceToCompetitors(source, competitors, CFG)
    expect(rows.find((r) => r.produit === 'Produit exclusif Jardiland')).toMatchObject({ position: 'non trouvé' })
  })

  it('onlyMatched exclut les non appariés', () => {
    const { rows } = compareSourceToCompetitors(source, competitors, { ...CFG, onlyMatched: true })
    expect(rows).toHaveLength(1)
  })

  it('apparie par EAN en secours quand aucune réf ne matche', () => {
    const src = [{ site: 's', name: 'X', ean: '4892210822604', url: '', price: '100' }]
    const comp = [{ site: 'c', name: 'Y différent', ean: '4892210822604', url: '', price: '90' }]
    const { rows } = compareSourceToCompetitors(src, comp, CFG)
    expect(rows[0]).toMatchObject({ ean: '4892210822604', prix_c: '90', position: 'plus cher' })
  })

  // Réf tronquée à la source (jardiland affiche « …RBC36X2 ») vs réf complète chez
  // le concurrent (« …RBC36X26B ») : l'appariement par préfixe doit les relier,
  // alors que les EAN diffèrent entre enseignes (fabricant vs distributeur).
  it('apparie une réf tronquée via préfixe (RBC36X2 ↔ RBC36X26B)', () => {
    const src = [{ site: 'jardiland.com', name: 'RYOBI Débroussailleuse 36V RBC36X2', ean: '6744473726508', url: '', price: '199,00' }]
    const comp = [{ site: 'castorama.fr', name: 'Pack RYOBI débroussailleuse RBC36X26B RAC114', ean: '3700812025181', url: '', price: '284,41' }]
    const { rows, matched } = compareSourceToCompetitors(src, comp, CFG)
    expect(matched).toBe(1)
    expect(rows[0]).toMatchObject({ prix_castorama_fr: '284.41', meilleur_concurrent: 'castorama.fr' })
  })

  it('ne crée PAS de faux appariement entre variantes distinctes (RY36LMXSP53A ≠ RY36LMXP46A)', () => {
    const src = [{ site: 's', name: 'RYOBI RY36LMXSP53A', ean: '', url: '', price: '982' }]
    const comp = [{ site: 'c', name: 'RYOBI RY36LMXP46A', ean: '', url: '', price: '599' }]
    const { rows } = compareSourceToCompetitors(src, comp, CFG)
    expect(rows[0]).toMatchObject({ position: 'non trouvé' })
  })

  it('colonne Marque (du produit source) + colorRules position', () => {
    const src = [{ site: 'jardiland.com', name: 'RYOBI RLM18E40H', brand: 'Ryobi', ean: '', url: '', price: '219' }]
    const comp = [{ site: 'castorama.fr', name: 'RYOBI RLM18E40H', brand: 'Ryobi', ean: '', url: '', price: '200' }]
    const { rows, colorRules } = compareSourceToCompetitors(src, comp, CFG)
    expect(rows[0]).toMatchObject({ marque: 'Ryobi', position: 'plus cher' })
    expect(colorRules.some((r) => r.column === 'position' && r.equals === 'plus cher' && r.tone === 'negative')).toBe(true)
  })

  it('prix barré + réduction % par concurrent', () => {
    const src = [{ site: 'jardiland.com', name: 'RYOBI RLM18E40H', ean: '', url: '', price: '219' }]
    const comp = [{ site: 'castorama.fr', name: 'RYOBI RLM18E40H', ean: '', url: '', price: '200', originalPrice: '250' }]
    const { rows } = compareSourceToCompetitors(src, comp, CFG)
    // réduc = (250-200)/250*100 = 20
    expect(rows[0]).toMatchObject({ prix_castorama_fr: '200', prix_barre_castorama_fr: '250', reduc_castorama_fr: '20' })
  })

  it('pas de prix barré si originalPrice ≤ prix (pas de promo)', () => {
    const src = [{ site: 'jardiland.com', name: 'RYOBI RLM18E40H', ean: '', url: '', price: '219' }]
    const comp = [{ site: 'castorama.fr', name: 'RYOBI RLM18E40H', ean: '', url: '', price: '200', originalPrice: '180' }]
    const { rows } = compareSourceToCompetitors(src, comp, CFG)
    expect(rows[0]).toMatchObject({ prix_barre_castorama_fr: '', reduc_castorama_fr: '' })
  })
})
