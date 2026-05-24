import { describe, it, expect } from 'vitest'
import { LayoutSchema, type LayoutBlock } from './semanticLayout'

describe('semanticLayout schema', () => {
  it('parse une réponse Gemini valide', () => {
    const parsed = LayoutSchema.parse({
      blocks: [
        { type: 'price', text: '5,49 €', memberIndices: [3, 4], priceValue: '5,49 €' },
        { type: 'headline', text: 'LES 2 POUR', memberIndices: [0, 1] },
      ],
    })
    expect(parsed.blocks).toHaveLength(2)
    expect(parsed.blocks[0].type).toBe('price')
  })
  it('rejette un type inconnu', () => {
    expect(() => LayoutSchema.parse({ blocks: [{ type: 'logo', text: 'x', memberIndices: [] }] })).toThrow()
  })
})
