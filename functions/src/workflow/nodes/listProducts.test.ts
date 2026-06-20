// functions/src/workflow/nodes/listProducts.test.ts
import { describe, it, expect } from 'vitest'
import { priceMarkerCount, THIN_LISTING_MARKERS } from './listProducts'

describe('priceMarkerCount — détection de grille produit maigre', () => {
  // Échantillon « maigre » : ce que Jina ramène d'une grille rendue en JS (peu de prix
  // visibles) — calibré sur le cas réel Castorama (~3-11 produits sortis).
  const thin = `
    # Tondeuse Ryobi
    Filtrer par marque, prix, disponibilité…
    Coupe-bordures et tondeuse hybride Ryobi 399 €
    Tondeuse Ryobi RY18LMH37A-250 399,90 €
    Tondeuse Ryobi RY18LMX40B 429,90 €
    Voir tous les résultats
  `
  // Échantillon « riche » : grille complète rendue (un prix par produit).
  const rich = Array.from({ length: 30 }, (_, i) => `Tondeuse Ryobi modèle ${i} ${300 + i},90 €`).join('\n')

  it('compte les marqueurs de prix € (FR/EN)', () => {
    expect(priceMarkerCount('1 299,90 €')).toBeGreaterThanOrEqual(1)
    expect(priceMarkerCount('€399.90')).toBeGreaterThanOrEqual(1)
    expect(priceMarkerCount('aucun prix ici')).toBe(0)
  })

  it('distingue une grille maigre d’une grille riche autour du seuil', () => {
    const t = priceMarkerCount(thin)
    const r = priceMarkerCount(rich)
    expect(t).toBeLessThan(THIN_LISTING_MARKERS) // maigre → déclenche l'escalade Bright Data
    expect(r).toBeGreaterThanOrEqual(THIN_LISTING_MARKERS) // riche → pas d'escalade
  })

  it('garde anti-régression : le contenu vide compte 0 (escalade comme avant)', () => {
    expect(priceMarkerCount('')).toBe(0)
  })
})
