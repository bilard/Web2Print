import { describe, it, expect } from 'vitest'
import { sanitizeIncomingProduct } from './enrichmentStore'
import type { EnrichedProduct } from './types'

function buildProduct(specs: EnrichedProduct['specifications']): EnrichedProduct {
  return {
    description: '',
    advantages: [],
    specifications: specs,
    variants: [],
    images: [],
    documents: [],
    sourceUrl: null,
    additionalSources: [],
    generatedAt: 0,
  }
}

describe('sanitizeIncomingProduct', () => {
  it('drops specs with unbalanced brackets in name (Nicoll megamenu pattern)', () => {
    // Cas réel observé : la mégamenu Drupal Nicoll (313 entrées) contient
    // des liens `[Fiche technique X Nicoll](url)` qui, mal convertis en
    // markdown puis hallucinés par le LLM, produisent des paires KEY/VALUE
    // avec crochets orphelins (`[Fiche technique...` sans `]`, ou
    // `Nicoll]X` sans `[`).
    const data = buildProduct([
      { name: '[Fiche technique Trappes de visite', value: '' },
      { name: 'Nicoll]CHUTUNIC® EVO', value: 'une nouvelle génération de chute unitaire éco-conçue' },
      { name: 'Nicoll]Manchette flexible universelle', value: '3 diamètres (32, 40 et 50)' },
      { name: 'Nicoll]Salle de bains', value: 'WC' },
      { name: 'Nicoll]Cuisine, lave-vaisselle et machine à laver', value: 'Garage / local d\'entretien' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out.specifications).toHaveLength(0)
  })

  it('keeps specs with balanced brackets (units like "Tension [V]")', () => {
    const data = buildProduct([
      { name: 'Tension [V]', value: '18' },
      { name: 'Capacité [Ah]', value: '5' },
      { name: 'Matériau', value: 'Acier galvanisé' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out.specifications).toHaveLength(3)
    expect(out.specifications[0].name).toBe('Tension [V]')
  })

  it('drops specs with empty value (placeholder "Valeur" leak)', () => {
    const data = buildProduct([
      { name: 'Poids', value: '' },
      { name: 'Tension', value: '   ' },
      { name: 'Couleur', value: 'Noir' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].name).toBe('Couleur')
  })

  it('still rejects placeholder header values ("Valeur", "Caractéristique")', () => {
    const data = buildProduct([
      { name: 'Couleur', value: 'Valeur' },
      { name: 'Spécification', value: 'Description' },
      { name: 'Poids', value: '2.3 kg' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].name).toBe('Poids')
  })

  it('still rejects fully bracketed names like "[Section]"', () => {
    const data = buildProduct([
      { name: '[Caractéristiques]', value: 'X' },
      { name: 'Tension', value: '18 V' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out.specifications).toHaveLength(1)
    expect(out.specifications[0].name).toBe('Tension')
  })

  it('returns the same reference when no spec needs filtering (avoids spurious re-renders)', () => {
    const data = buildProduct([
      { name: 'Tension', value: '18 V' },
      { name: 'Poids', value: '2.3 kg' },
    ])
    const out = sanitizeIncomingProduct(data)
    expect(out).toBe(data)
  })
})
