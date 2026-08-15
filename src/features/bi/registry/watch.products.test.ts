// ⚠⚠ Ce que ces tests protègent : un « top des produits où je suis trop cher » classé À
// L'ENVERS. Le rapport de veille exprime l'écart du CONCURRENT vu de moi (négatif quand il
// est moins cher) ; cette source l'exprime de MOI vers le meilleur prix (positif quand je
// suis plus cher). Se tromper de sens ne se verrait pas — le graphe resterait plausible.
import { describe, it, expect } from 'vitest'
import { productRows } from './watch.source'
import type { ProductRow } from '@/features/priceWatch/catalog/report'

const cell = (domain: string, priceHt: number | null) => ({
  siteId: domain, domain, name: domain, url: '', image: null,
  priceTtc: null, priceHt, listPriceTtc: null, gapPct: null, stock: null, match: 'exact-ref',
}) as ProductRow['competitors'][number]

const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: 'p1', name: 'Courroie A', reference: 'REF-1', ean: null, famille: 'COURROIES',
  myPriceHt: 100, sourceUrl: null, competitors: [], bestGapPct: null, undercut: false,
  ...over,
})

describe('l’écart d’un produit apparié', () => {
  it('se compte de MOI vers le meilleur prix concurrent, positif quand je suis plus cher', () => {
    const [row] = productRows([product({
      myPriceHt: 100, competitors: [cell('a.fr', 80), cell('b.fr', 90)],
      bestGapPct: -20, undercut: true,
    })])
    expect(row.minPriceHt).toBe(80)
    expect(row.cheapest).toBe('a.fr')
    expect(row.gapEur).toBe(20)
    expect(row.gapPct).toBe(20)
  })

  it('devient NÉGATIF quand c’est moi le moins cher', () => {
    const [row] = productRows([product({
      myPriceHt: 100, competitors: [cell('a.fr', 130)], bestGapPct: 30, undercut: false,
    })])
    expect(row.gapEur).toBe(-30)
    expect(row.gapPct).toBe(-30)
    expect(row.position).toBe('Je suis moins cher')
  })

  it('nomme les trois positions comme le cockpit', () => {
    const undercut = productRows([product({ competitors: [cell('a.fr', 80)], bestGapPct: -20, undercut: true })])
    const aligned = productRows([product({ competitors: [cell('a.fr', 100)], bestGapPct: 0 })])
    expect(undercut[0].position).toBe('Concurrent moins cher')
    expect(aligned[0].position).toBe('Aligné')
  })

  // ⚠⚠ Sans prix concurrent, le produit n'est pas « à égalité » : il est INCOMPARABLE.
  it('laisse tout à null quand aucun concurrent n’a de prix', () => {
    const [row] = productRows([product({ competitors: [cell('a.fr', null)] })])
    expect(row.minPriceHt).toBeNull()
    expect(row.gapEur).toBeNull()
    expect(row.position).toBeNull()
    expect(row.pricedCompetitors).toBe(0)
  })

  it('ignore les concurrents SANS prix dans le décompte et le minimum', () => {
    const [row] = productRows([product({
      competitors: [cell('a.fr', null), cell('b.fr', 70), cell('c.fr', 95)], bestGapPct: -30,
    })])
    expect(row.pricedCompetitors).toBe(2)
    expect(row.minPriceHt).toBe(70)
    expect(row.cheapest).toBe('b.fr')
  })
})
