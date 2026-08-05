// Découpe du catalogue source en tranches Firestore. Le test porte sur la RÈGLE, pas sur
// l'écriture : un dépassement de 1 Mo fait refuser le document entier, et l'échec ne
// remonte qu'en avertissement de fin de run.
import { describe, it, expect } from 'vitest'
import { sliceSourceCatalogForTest, SOURCE_CHUNK_BYTES_FOR_TEST } from './reportStore'

const bytes = (o: unknown) => new TextEncoder().encode(JSON.stringify(o)).length

describe('découpe du catalogue source', () => {
  it('garde chaque tranche sous la limite d’un document', () => {
    // Descriptions longues : c'est le cas qui faisait sauter l'ancien découpage par 2 000.
    const products = Array.from({ length: 5000 }, (_, i) => ({
      id: `p${i}`, name: `Produit ${i}`, ref: `REF-${i}`,
      description: 'x'.repeat(300), taxo: ['Famille', 'Sous-famille', 'Groupe'],
    }))
    const slices = sliceSourceCatalogForTest(products)
    expect(slices.length).toBeGreaterThan(1)
    for (const s of slices) expect(bytes(s)).toBeLessThanOrEqual(SOURCE_CHUNK_BYTES_FOR_TEST)
  })

  it('ne perd aucun produit, dans l’ordre', () => {
    const products = Array.from({ length: 4321 }, (_, i) => ({ id: `p${i}`, name: 'x' }))
    const flat = sliceSourceCatalogForTest(products).flat()
    expect(flat).toHaveLength(4321)
    expect(flat[0]).toBe(products[0])
    expect(flat[4320]).toBe(products[4320])
  })

  it('rend une tranche vide pour un catalogue vide (jamais zéro tranche)', () => {
    expect(sliceSourceCatalogForTest([])).toEqual([[]])
  })

  it('isole un produit géant plutôt que de le coller à un autre', () => {
    const huge = { id: 'h', name: 'x'.repeat(SOURCE_CHUNK_BYTES_FOR_TEST) }
    const slices = sliceSourceCatalogForTest([{ id: 'a', name: 'a' }, huge, { id: 'b', name: 'b' }])
    expect(slices).toHaveLength(3)
    expect(slices[1]).toEqual([huge])
  })
})
