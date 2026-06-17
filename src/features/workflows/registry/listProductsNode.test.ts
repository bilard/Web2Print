// src/features/workflows/registry/listProductsNode.test.ts
import { describe, it, expect } from 'vitest'
import { resolveEan } from './listProductsNode'

describe('resolveEan', () => {
  it('REJETTE un EAN du LLM non corroboré (anti-hallucination)', () => {
    // 13 chiffres plausibles mais absents de l'URL/image/nom → inventé → ''
    expect(resolveEan('4892210822604', '', '', '')).toBe('')
    expect(resolveEan('  4892210822604 ', 'img-noean.jpg', 'https://x.fr/p/abc', 'Tondeuse')).toBe('')
  })

  it('garde l’EAN du LLM s’il est corroboré par l’URL/image/nom', () => {
    expect(resolveEan('4892210822604', '', 'https://x.fr/p/4892210822604_CAFR.prd', '')).toBe('4892210822604')
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

  it('REJETTE un id marketplace à 13 chiffres invalide (mauvaise clé EAN-13)', () => {
    // Cas réel jardiland : produit marketplace, EAN absent, le slug d'URL finit par
    // un id produit « 6744473726508 » (checksum EAN-13 KO) → ne doit PAS être pris.
    const url = 'https://www.jardiland.com/p/...-rbc36x2-6744473726508-1e34ab3'
    expect(resolveEan('', '', url, 'RYOBI Débroussailleuse - RBC36X2')).toBe('')
  })

  it('garde un vrai EAN-13 valide dans le chemin image (checksum OK)', () => {
    const image = 'https://media.jardiland.com/.../AssetExport/21355779.4892210254887.11922.jpg'
    expect(resolveEan('', image, 'https://www.jardiland.com/p/x', 'Tondeuse')).toBe('4892210254887')
  })

  it('saute un id invalide et prend le 1er EAN-13 VALIDE de la même source', () => {
    // url avec id marketplace invalide PUIS un vrai EAN valide
    const url = 'https://x.fr/p/rbc36x2-6744473726508-x-4892210254887'
    expect(resolveEan('', '', url, '')).toBe('4892210254887')
  })
})
