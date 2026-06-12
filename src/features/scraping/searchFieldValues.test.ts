import { describe, it, expect } from 'vitest'
import { resolveFieldValue } from './searchFieldValues'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'

const product: EnrichedProduct = {
  name: 'Tondeuse Honda HRG 416 XB',
  brand: 'Honda',
  model: 'HRG 416 XB',
  distributorRef: '89725431',
  manufacturerRef: 'HRG416XB',
  ean: '4945943207894',
  description: 'Tondeuse à batterie silencieuse.',
  price: null,
  pricing: { ttc: 549, original: 649, discount: { percent: 15 }, currency: 'EUR' },
  advantages: [],
  specifications: [{ name: 'Largeur de coupe', value: '41 cm' }],
  variants: [],
  images: [],
  documents: [],
  sourceUrl: 'https://www.leroymerlin.fr/produits/tondeuse-honda.html',
  additionalSources: [],
  generatedAt: 0,
}

describe('resolveFieldValue', () => {
  it('site source → host de la page scrapée', () => {
    expect(resolveFieldValue('le site source', product)).toBe('leroymerlin.fr')
  })
  it('nom du produit → name', () => {
    expect(resolveFieldValue('nom du produit', product)).toBe('Tondeuse Honda HRG 416 XB')
  })
  it('référence (accentuée) → distributorRef', () => {
    expect(resolveFieldValue('la référence', product)).toBe('89725431')
  })
  it('EAN → ean', () => {
    expect(resolveFieldValue('EAN', product)).toBe('4945943207894')
  })
  it('prix de vente → pricing.ttc formaté', () => {
    expect(resolveFieldValue('prix de vente', product)).toContain('549')
  })
  it('promos → prix barré + remise', () => {
    const v = resolveFieldValue('promos', product)
    expect(v).toContain('649')
    expect(v).toContain('−15%')
  })
  it('champ inconnu → fallback specs par libellé', () => {
    expect(resolveFieldValue('largeur de coupe', product)).toBe('41 cm')
  })
  it('champ introuvable → chaîne vide', () => {
    expect(resolveFieldValue('garantie constructeur', product)).toBe('')
  })
})
