// src/features/workflows/registry/listProductsNode.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEan } from './listProductsNode'

describe('resolveEan', () => {
  it('garde l’EAN du LLM s’il fait 13 chiffres', () => {
    expect(resolveEan('4892210822604', '', '', '')).toBe('4892210822604')
    expect(resolveEan('  4892210822604 ', '', '', '')).toBe('4892210822604')
  })

  it('repêche l’EAN dans le chemin image (cas Jardiland)', () => {
    const image = 'https://media.jardiland.com/.../AssetExport/01404817.4892210822604.11922.90028153.jpg'
    expect(resolveEan('', image, 'https://www.jardiland.com/p/...-ryobi-1404817', 'Tondeuse')).toBe('4892210822604')
  })

  it('repêche l’EAN dans l’URL fiche (cas Castorama)', () => {
    const url = 'https://www.castorama.fr/mkp/tondeuse.../4892210822604_CAFR.prd'
    expect(resolveEan('', '', url, 'Tondeuse')).toBe('4892210822604')
  })

  it('retourne "" si aucun code à 13 chiffres nulle part', () => {
    expect(resolveEan('123', 'img-42.jpg', 'https://x.fr/p/abc-1404817', 'Tondeuse 1800W')).toBe('')
  })
})
