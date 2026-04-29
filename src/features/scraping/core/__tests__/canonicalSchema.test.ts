import { describe, it, expect } from 'vitest'
import { EnrichedProductSchema } from '../canonicalSchema'

describe('EnrichedProductSchema', () => {
  const minimal = {
    url: 'https://example.com/p/1',
    scrapedAt: 1714400000000,
    identity: { name: 'Perceuse 18V', reference: null, brand: null, ean: null, breadcrumb: [] },
    marketing: { subtitle: null, description: null, advantages: [] },
    commercial: { price: null, availability: null },
    specifications: [],
    variants: [],
    media: { images: [], documents: [] },
    meta: { sourcesScraped: ['https://example.com/p/1'], llmModel: 'gemini-3.1-pro-preview', llmProvider: 'gemini' as const, warnings: [] },
  }

  it('valide un produit minimal complet', () => {
    expect(() => EnrichedProductSchema.parse(minimal)).not.toThrow()
  })

  it('rejette une URL invalide', () => {
    expect(() => EnrichedProductSchema.parse({ ...minimal, url: 'not-a-url' })).toThrow()
  })

  it('rejette un nom manquant', () => {
    const bad = { ...minimal, identity: { ...minimal.identity, name: undefined } }
    expect(() => EnrichedProductSchema.parse(bad)).toThrow()
  })

  it('accepte des specs groupées', () => {
    const withSpecs = { ...minimal, specifications: [
      { group: 'Moteur', name: 'Tension', value: '18 V' },
      { group: 'Moteur', name: 'Puissance', value: '500 W' },
    ] }
    expect(() => EnrichedProductSchema.parse(withSpecs)).not.toThrow()
  })

  it('accepte un prix structuré', () => {
    const withPrice = { ...minimal, commercial: {
      price: { amount: 299, currency: 'EUR', raw: '299,00 €' },
      availability: 'En stock',
    } }
    expect(() => EnrichedProductSchema.parse(withPrice)).not.toThrow()
  })

  it('accepte llmProvider claude/gemini/openai uniquement', () => {
    const bad = { ...minimal, meta: { ...minimal.meta, llmProvider: 'mistral' as unknown as 'claude' } }
    expect(() => EnrichedProductSchema.parse(bad)).toThrow()
  })
})
