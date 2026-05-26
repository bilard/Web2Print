import { describe, it, expect } from 'vitest'
import { serializeStructured, structuredHasSignal } from './enrichRow'
import type { StructuredProductData } from '@/features/scraping/core/structuredData'

const base: StructuredProductData = { images: [], specs: [] }

describe('structuredHasSignal', () => {
  it('vide → faux', () => {
    expect(structuredHasSignal(base)).toBe(false)
  })
  it('nom seul (sans specs/prix/desc) → faux', () => {
    expect(structuredHasSignal({ ...base, name: 'Tondeuse' })).toBe(false)
  })
  it('nom + specs → vrai', () => {
    expect(structuredHasSignal({ ...base, name: 'X', specs: [{ name: 'Poids', value: '15 kg' }] })).toBe(true)
  })
  it('nom + prix → vrai', () => {
    expect(structuredHasSignal({ ...base, name: 'X', offers: { price: 421.72 } })).toBe(true)
  })
  it('nom + description courte (<60) → faux ; longue → vrai', () => {
    expect(structuredHasSignal({ ...base, name: 'X', description: 'courte' })).toBe(false)
    expect(structuredHasSignal({ ...base, name: 'X', description: 'd'.repeat(61) })).toBe(true)
  })
})

describe('serializeStructured', () => {
  it('rend identité, prix, description, specs et bloc images', () => {
    const md = serializeStructured({
      name: 'EasyRotak 36-550',
      brand: 'Bosch',
      sku: '88326076',
      gtin: '4059952570',
      category: 'Tondeuses',
      description: 'Tondeuse sans fil 36V.',
      offers: { price: 421.72, priceCurrency: 'EUR' },
      specs: [
        { name: 'Largeur de coupe', value: '38 cm' },
        { name: 'Poids', value: '15 kg' },
      ],
      images: ['https://media.adeo.com/x?width=650', 'https://media.adeo.com/y?width=650'],
    })
    expect(md).toContain('# EasyRotak 36-550')
    expect(md).toContain('Marque : Bosch')
    expect(md).toContain('Référence / SKU : 88326076')
    expect(md).toContain('GTIN / EAN : 4059952570')
    expect(md).toContain('Prix : 421.72 EUR')
    expect(md).toContain('Tondeuse sans fil 36V.')
    expect(md).toContain('- Largeur de coupe : 38 cm')
    // Images sans extension → captées via le bloc explicite.
    expect(md).toContain('JINA_EXTRACTED_IMAGES_START')
    expect(md).toContain('https://media.adeo.com/x?width=650')
  })

  it('structuré minimal → markdown réduit, sans bloc images', () => {
    const md = serializeStructured({ ...base, name: 'X' })
    expect(md).toBe('# X')
  })
})
