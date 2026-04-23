import { describe, it, expect } from 'vitest'
import { templateFillSchema } from '../templateFillSchema'

describe('templateFillSchema', () => {
  const valid = {
    templateId: 'retail-product-portrait',
    palette: { primary: '#0A6E7C', secondary: '#E30613', neutral: '#F4F6F8', text: '#0E2A47' },
    copy: {
      title: 'TAILLE-HAIE À BATTERIE',
      subtitle: 'DUH752Z — 75 cm',
      features: [
        { title: 'Puissance Équivalente', desc: 'Moteur BL sans balais.', pictoHint: 'zap' },
      ],
      priceNew: '199,50€',
      priceOld: '250,77€',
      cta: 'ACHETER MAINTENANT',
      mentions: '*Batterie non incluse*',
    },
    assetMappings: { logo: 0, badge: 1, heroProduct: 3 },
  }

  it('accepts a valid fill data', () => {
    expect(() => templateFillSchema.parse(valid)).not.toThrow()
  })

  it('rejects title longer than 60 chars', () => {
    const tooLong = { ...valid, copy: { ...valid.copy, title: 'A'.repeat(61) } }
    expect(() => templateFillSchema.parse(tooLong)).toThrow()
  })

  it('rejects palette with invalid hex', () => {
    const bad = { ...valid, palette: { ...valid.palette, primary: 'red' } }
    expect(() => templateFillSchema.parse(bad)).toThrow()
  })

  it('rejects features without title', () => {
    const bad = { ...valid, copy: { ...valid.copy, features: [{ desc: 'x', title: '' }] } }
    expect(() => templateFillSchema.parse(bad)).toThrow()
  })

  it('accepts features array with up to 8 items', () => {
    const withMax = {
      ...valid,
      copy: {
        ...valid.copy,
        features: Array.from({ length: 8 }, (_, i) => ({
          title: `F${i}`,
          desc: 'desc',
        })),
      },
    }
    expect(() => templateFillSchema.parse(withMax)).not.toThrow()
  })

  it('rejects features array with more than 8 items', () => {
    const tooMany = {
      ...valid,
      copy: {
        ...valid.copy,
        features: Array.from({ length: 9 }, (_, i) => ({ title: `F${i}`, desc: 'x' })),
      },
    }
    expect(() => templateFillSchema.parse(tooMany)).toThrow()
  })

  it('accepts tagline under 40 chars', () => {
    const withTagline = { ...valid, copy: { ...valid.copy, tagline: 'PROFITEZ DE L\'OFFRE MAKITA !' } }
    expect(() => templateFillSchema.parse(withTagline)).not.toThrow()
  })

  it('rejects tagline over 40 chars', () => {
    const tooLong = { ...valid, copy: { ...valid.copy, tagline: 'A'.repeat(41) } }
    expect(() => templateFillSchema.parse(tooLong)).toThrow()
  })

  it('accepts missing tagline (optional)', () => {
    const { tagline: _, ...copyWithoutTagline } = valid.copy as { tagline?: string } & typeof valid.copy
    const withoutTagline = { ...valid, copy: copyWithoutTagline }
    expect(() => templateFillSchema.parse(withoutTagline)).not.toThrow()
  })
})
