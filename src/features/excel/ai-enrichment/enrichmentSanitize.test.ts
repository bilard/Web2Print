import { describe, it, expect } from 'vitest'
import { sanitizeEnrichedProduct, isNavLikeDescription } from './enrichmentSanitize'
import type { EnrichedProduct } from './types'

const baseProduct: EnrichedProduct = {
  description: '',
  breadcrumb: undefined,
  advantages: [],
  specifications: [],
  variants: [],
  images: [],
  documents: [],
  sourceUrl: null,
  additionalSources: [],
  generatedAt: 0,
}

describe('isNavLikeDescription', () => {
  it('detects RS-style concatenated nav (no whitespace between terms)', () => {
    expect(isNavLikeDescription('Nos servicesLe blog RSSecteurs industriels Aide & Contact')).toBe(true)
  })

  it('detects metadata-only descriptions', () => {
    expect(isNavLikeDescription('Code commande RS:252-2566 Référence fabricant:DLM432Z Marque:Makita')).toBe(true)
  })

  it('keeps real product descriptions', () => {
    const desc = 'Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace de l\'herbe.'
    expect(isNavLikeDescription(desc)).toBe(false)
  })

  it('returns false for empty / very short text', () => {
    expect(isNavLikeDescription('')).toBe(false)
    expect(isNavLikeDescription('court')).toBe(false)
  })
})

describe('sanitizeEnrichedProduct — defensive cleanup', () => {
  it('clears nav-style description (RS Components real case)', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      description: 'Nos servicesLe blog RSSecteurs industriels Aide & Contact\n\nCode commande RS:252-2566 Référence fabricant:DLM432Z Marque:Makita',
    })
    expect(out.description).toBe('')
  })

  it('keeps real product description', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      description: 'Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace.',
    })
    expect(out.description).toBe('Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace.')
  })

  it('rejects spec where name is checkbox marker', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      specifications: [
        { name: '- [x]', value: 'Marque Makita' },
        { name: 'Marque', value: 'Makita' },
      ],
    })
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].name).toBe('Marque')
  })

  it('rejects pricing-leak specs (RS pricing widget)', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      specifications: [
        { name: 'Unité', value: 'Prix par unité' },
        { name: '1 +', value: '1 282,35€' },
        { name: 'Besoin de plus?', value: 'Cliquez sur "Vérifier les dates de livraison" pour plus de détails' },
        { name: 'Marque', value: 'Makita' },
      ],
    })
    // Marque/Makita is the only legitimate spec (others have prose name, pricing value, or UI button)
    const names = out.specifications.map(s => s.name)
    expect(names).toContain('Marque')
    expect(names).not.toContain('1 +')
    expect(names).not.toContain('Besoin de plus?')
  })

  it('rejects prose-style specs (long sentence as name)', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      specifications: [
        { name: 'L\'indicateur de niveau d\'herbe surveille l\'état du bac de collecte', value: 'Poignée ergonomique caoutchoutée pour un meilleur confort d\'utilisation' },
        { name: 'Tension', value: '18 V' },
      ],
    })
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].name).toBe('Tension')
  })

  it('rejects specs where group is a section H2 (Caractéristiques et avantages)', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      specifications: [
        { name: 'Item 1', value: 'Item 2', group: '**CARACTÉRISTIQUES ET AVANTAGES**' },
        { name: 'Item 1', value: 'Item 2', group: 'APPLICATIONS' },
        { name: 'Tension', value: '18 V', group: 'Moteur' },
      ],
    })
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].group).toBe('Moteur')
  })

  it('drops fragment groups in advantages (ET avantages, OU ...)', () => {
    const out = sanitizeEnrichedProduct({
      ...baseProduct,
      advantages: [
        { text: 'Démarrage progressif', group: 'ET avantages' },
        { text: 'Indicateur d\'herbe', group: 'Points forts' },
      ],
    })
    expect(out.advantages[0].group).toBeUndefined()
    expect(out.advantages[1].group).toBe('Points forts')
  })

  it('is idempotent (running twice produces the same result)', () => {
    const dirty = {
      ...baseProduct,
      description: 'Nos services Le blog RS Secteurs industriels Aide & Contact',
      specifications: [
        { name: '- [x]', value: 'Marque Makita' },
        { name: 'Tension', value: '18 V' },
      ],
    }
    const once = sanitizeEnrichedProduct(dirty)
    const twice = sanitizeEnrichedProduct(once)
    expect(twice).toEqual(once)
  })

  it('preserves clean product unchanged', () => {
    const clean: EnrichedProduct = {
      ...baseProduct,
      description: 'Cette tondeuse à gazon alimentée par batterie est conçue pour une tonte efficace.',
      specifications: [
        { name: 'Marque', value: 'Makita' },
        { name: 'Tension', value: '18 V', group: 'Moteur' },
      ],
      advantages: [
        { text: 'Démarrage progressif' },
        { text: 'Indicateur d\'herbe', group: 'Points forts' },
      ],
    }
    const out = sanitizeEnrichedProduct(clean)
    expect(out.description).toBe(clean.description)
    expect(out.specifications).toEqual(clean.specifications)
    expect(out.advantages).toEqual(clean.advantages)
  })
})
