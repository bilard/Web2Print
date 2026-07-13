import { describe, it, expect } from 'vitest'
import { mapProductToFields, mapProductToAssets, isEmptyProduct } from './enrichRow'
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

describe('isEmptyProduct (parité PIM ↔ workflow)', () => {
  it('null → vide', () => {
    expect(isEmptyProduct(null)).toBe(true)
  })

  it('produit PARTIEL marqué anti-bot (JSON-LD : marque + description + image) → CONSERVÉ', () => {
    // Régression historique : le workflow jetait ce produit alors que le PIM l'affiche.
    const p: EnrichedProduct = {
      ...base,
      name: 'Tondeuse Rotak 18V',
      brand: 'Bosch',
      description: 'Tondeuse sur batterie.',
      images: ['https://media.adeo.com/p/photo1.jpg'],
      blockedByAntiBot: true,
    }
    expect(isEmptyProduct(p)).toBe(false)
  })

  it('produit RÉELLEMENT vide marqué anti-bot (aucun contenu) → vide', () => {
    const p: EnrichedProduct = { ...base, scrapingProvider: 'Jina (bloqué)', blockedByAntiBot: true }
    expect(isEmptyProduct(p)).toBe(true)
  })

  it('seul le name (titre dérivé du slug) sans contenu réel → vide', () => {
    // name est exclu du calcul : présent même sur une page 100 % bloquée.
    const p: EnrichedProduct = { ...base, name: 'tondeuse sur batterie bosch rotak 18v' }
    expect(isEmptyProduct(p)).toBe(true)
  })

  it('specs seules suffisent à conserver le produit', () => {
    const p: EnrichedProduct = { ...base, specifications: [{ name: 'Poids', value: '15 kg' }] }
    expect(isEmptyProduct(p)).toBe(false)
  })
})

describe('homogénéité identité/description (sites fabricant à variantes)', () => {
  const base = { images: [], advantages: [], specifications: [], documents: [], breadcrumb: [] }

  it('nom = CODE et réf = PROSE → échange (Milwaukee M18 FHAC16-302X)', () => {
    const f = mapProductToFields({
      ...base,
      name: 'M18 FHAC16-302X',
      distributorRef: 'M18 FUEL™ Perforateur SDS+ 16 mm',
    } as never, ['name', 'reference'])
    expect(f.name).toBe('M18 FUEL™ Perforateur SDS+ 16 mm')
    expect(f.reference).toBe('M18 FHAC16-302X')
  })

  it('nom descriptif normal → aucun échange', () => {
    const f = mapProductToFields({
      ...base,
      name: 'Perceuse à percussion GSB 18V',
      distributorRef: 'GSB18V-55',
    } as never, ['name', 'reference'])
    expect(f.name).toBe('Perceuse à percussion GSB 18V')
    expect(f.reference).toBe('GSB18V-55')
  })

  it('CTA de carte collé au nom retiré (« …COMPACTEEn savoir plus »)', () => {
    const f = mapProductToFields({
      ...base,
      name: 'M18™ BRUSHLESS PERCEUSE VISSEUSE COMPACTEEn savoir plus',
    } as never, ['name'])
    expect(f.name).toBe('M18™ BRUSHLESS PERCEUSE VISSEUSE COMPACTE')
  })

  it('description : artefacts markdown/javascript: assainis', () => {
    const f = mapProductToFields({
      ...base,
      name: 'X',
      description: "M18 FPD3 ![Image 68: Perceuse à percussion M18 FUEL™ (116) Perceuse](javascript:throw new Error('React has blocked a javascript: URL as a security precaution.'))",
    } as never, ['description'])
    expect(String(f.description)).not.toMatch(/javascript:|!\[|\]\(/)
    expect(String(f.description)).toContain('M18 FPD3')
  })
})

// Démo express : le NOM du produit recopié tel quel dans les avantages
// (« Ventilateur Sans Hélice Noir » en puce) dupliquait le titre de la fiche.
describe('mapProductToFields — avantages ≠ titre du produit', () => {
  it('retire l’avantage identique au nom (normalisé), garde les autres', () => {
    const fields = mapProductToFields(
      {
        name: 'Ventilateur Sans Hélice Noir',
        advantages: [
          { text: 'Ventilateur Sans Hélice Noir' },
          { text: 'Conception sans pales, sécurisée pour les enfants' },
        ],
      } as never,
      ['advantages'],
    )
    expect(fields.advantages).toBe('Conception sans pales, sécurisée pour les enfants')
  })
})
