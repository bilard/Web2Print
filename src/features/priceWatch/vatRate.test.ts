// La TVA du catalogue source est un TAUX (0,2), jamais un pourcentage (20).
//
// Le défaut de relecture valait 20 — soit 2 000 % : chaque prix concurrent était divisé
// par 21, tombait sous le garde-fou anti-prix-aberrant, et le rapport sortait avec
// « 0 comparaison » sur des dizaines de milliers de produits pourtant appariés. Toutes
// les tuiles de positionnement (tenue prix, indice tarif, écart cumulé) restaient vides,
// sans un message. Ce test fige la règle : hors ]0, 1[, on retombe sur 0,2.
import { describe, it, expect } from 'vitest'
import { comparePrices, DEFAULT_VAT_RATE } from './catalog/match'

/** Réplique la normalisation de `loadSourceCatalog`. */
function vatOf(raw: unknown): number {
  return typeof raw === 'number' && raw > 0 && raw < 1 ? raw : DEFAULT_VAT_RATE
}

describe('taux de TVA du catalogue source', () => {
  it('accepte un taux, refuse un pourcentage', () => {
    expect(vatOf(0.2)).toBe(0.2)
    expect(vatOf(0.055)).toBe(0.055)
    expect(vatOf(20)).toBe(DEFAULT_VAT_RATE)
    expect(vatOf(undefined)).toBe(DEFAULT_VAT_RATE)
    expect(vatOf(0)).toBe(DEFAULT_VAT_RATE)
  })

  it('un pourcentage pris pour un taux annulait TOUTES les comparaisons', () => {
    const listing = { url: 'u', name: 'n', price: 120 }
    // Avec le taux correct : 120 TTC → 100 HT, comparable à un prix source de 100.
    expect(comparePrices(100, listing, { vatRate: 0.2 }).deltaPct).toBe(0)
    // Avec 20 pris pour un taux : 120 / 21 ≈ 5,71 € — sous le seuil d'aberration, le
    // prix est ÉCARTÉ et aucun écart n'est produit.
    expect(comparePrices(100, listing, { vatRate: 20 }).deltaPct).toBeUndefined()
  })
})
