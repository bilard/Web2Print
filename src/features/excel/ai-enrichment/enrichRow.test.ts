import { describe, it, expect } from 'vitest'
import { mapProductToFields, mapProductToAssets } from './enrichRow'
import type { EnrichedProduct } from './types'

const base: EnrichedProduct = {
  description: '',
  advantages: [],
  specifications: [],
  variants: [],
  images: [],
  documents: [],
  sourceUrl: null,
  additionalSources: [],
  generatedAt: 0,
}

describe('mapProductToFields', () => {
  it('mappe les clés standard du template vers EnrichedProduct', () => {
    const p: EnrichedProduct = {
      ...base,
      name: 'EasyRotak 36-550',
      brand: 'Bosch',
      distributorRef: '88326076',
      model: 'Rotak 36-550',
      ean: '4059952570',
      description: 'Tondeuse sans fil 36V.',
      breadcrumb: ['Jardin', 'Tondeuses'],
      advantages: [{ text: 'Léger' }, { text: 'Ergo-Flex' }],
      specifications: [
        { name: 'Largeur de coupe', value: '38 cm' },
        { name: 'Poids', value: '15 kg' },
      ],
      images: ['https://media.adeo.com/a?w=650', 'https://media.adeo.com/b?w=650'],
      documents: [{ name: 'Notice', url: 'https://x/notice.pdf', filename: 'notice.pdf' }],
    }
    const f = mapProductToFields(p, [
      'name', 'reference', 'subtitle', 'description', 'breadcrumb',
      'advantages', 'brand', 'ean', 'images', 'specifications', 'documents',
    ])
    expect(f.name).toBe('EasyRotak 36-550')
    expect(f.reference).toBe('88326076')
    expect(f.subtitle).toBe('Rotak 36-550')
    expect(f.description).toBe('Tondeuse sans fil 36V.')
    expect(f.breadcrumb).toBe('Jardin > Tondeuses')
    expect(f.advantages).toBe('Léger\nErgo-Flex')
    expect(f.brand).toBe('Bosch')
    expect(f.ean).toBe('4059952570')
    expect(f.specifications).toBe('Largeur de coupe: 38 cm\nPoids: 15 kg')
    expect(f.documents).toBe('https://x/notice.pdf')
  })

  it('champ inconnu → customFields, sinon null', () => {
    const p: EnrichedProduct = { ...base, name: 'X', customFields: { garantie: '3 ans' } }
    const f = mapProductToFields(p, ['garantie', 'inexistant'])
    expect(f.garantie).toBe('3 ans')
    expect(f.inexistant).toBeNull()
  })

  it('reference : fallback distributorRef → manufacturerRef → model', () => {
    expect(mapProductToFields({ ...base, manufacturerRef: 'MPN1' }, ['reference']).reference).toBe('MPN1')
    expect(mapProductToFields({ ...base, model: 'MOD1' }, ['reference']).reference).toBe('MOD1')
  })
})

describe('mapProductToAssets', () => {
  it('garde les images produit, filtre logos/pictos, ajoute les PDFs', () => {
    const p: EnrichedProduct = {
      ...base,
      images: [
        'https://media.adeo.com/p/photo1.jpg',
        'https://cdn.site.com/logo.svg', // picto/logo → filtré
        'https://cdn.site.com/icons/cart.png', // picto → filtré
      ],
      documents: [{ name: 'Fiche', url: 'https://x/fiche.pdf', filename: 'fiche.pdf' }],
    }
    const assets = mapProductToAssets(p)
    expect(assets).toEqual([
      { url: 'https://media.adeo.com/p/photo1.jpg', type: 'image' },
      { url: 'https://x/fiche.pdf', type: 'pdf' },
    ])
  })

  it('aucun asset → tableau vide', () => {
    expect(mapProductToAssets(base)).toEqual([])
  })
})
