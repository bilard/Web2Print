import { describe, it, expect } from 'vitest'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'
import type { Brief, CartItem } from '@/features/briefs/types'

const briefBase = {
  id: 'b1',
  taxonomyId: 't1',
  ownerId: 'u1',
  clientName: 'Acme',
  status: 'cart_ready',
  currentStep: 4,
  client: {
    formTemplateSnapshot: [],
    values: {
      companyName: 'Acme Corp',
      sector: 'Restauration',
      primaryColor: '#FF6600',
      secondaryColor: '#003366',
    },
  },
} as unknown as Brief

const item: CartItem = {
  sku: 'DRP-FR-100150',
  name: 'Drapeau publicitaire 100x150',
  categoryNodeId: 'n1',
  quantity: 4,
  unitPrice: 89,
  description: 'Drapeau imprimé recto-verso, mat alu fourni',
  source: 'ai',
}

describe('buildHeroImagePrompt', () => {
  it('produces an English prompt mentioning the client sector', () => {
    const p = buildHeroImagePrompt(briefBase)
    expect(p).toMatch(/restauration|restaurant|hospitality/i)
    expect(p.toLowerCase()).toContain('photorealistic')
  })

  it('mentions brand colors when present', () => {
    const p = buildHeroImagePrompt(briefBase)
    expect(p).toContain('#FF6600')
  })

  it('falls back gracefully when sector is missing', () => {
    const b = {
      ...briefBase,
      client: { ...briefBase.client, values: { companyName: 'X' } },
    } as Brief
    expect(() => buildHeroImagePrompt(b)).not.toThrow()
  })

  it('is deterministic for the same input', () => {
    expect(buildHeroImagePrompt(briefBase)).toBe(buildHeroImagePrompt(briefBase))
  })

  it('forbids text and logos in the rendered scene', () => {
    const p = buildHeroImagePrompt(briefBase).toLowerCase()
    expect(p).toContain('no text')
    expect(p).toContain('no logo')
  })
})

describe('buildProductImagePrompt', () => {
  it('mentions the product name and the client sector', () => {
    const p = buildProductImagePrompt(briefBase, item)
    expect(p).toContain('Drapeau publicitaire 100x150')
    expect(p.toLowerCase()).toMatch(/restauration|restaurant|hospitality/)
  })

  it('forbids text overlays', () => {
    const p = buildProductImagePrompt(briefBase, item).toLowerCase()
    expect(p).toContain('no text')
  })

  it('is deterministic', () => {
    expect(buildProductImagePrompt(briefBase, item)).toBe(
      buildProductImagePrompt(briefBase, item),
    )
  })
})
