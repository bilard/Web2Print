import { describe, it, expect } from 'vitest'
import { detectColumnFormat } from './google'

describe('detectColumnFormat', () => {
  it('EAN → TEXTE (évite la notation scientifique)', () => {
    expect(detectColumnFormat('ean', 'EAN', ['4892210822604', '3700123456789'])).toEqual({ type: 'TEXT', pattern: '@' })
  })

  it('référence → TEXTE', () => {
    expect(detectColumnFormat('reference', 'Réf.', ['RY18LM37A'])?.type).toBe('TEXT')
  })

  it('prix → devise €', () => {
    const f = detectColumnFormat('prix_source', 'Prix source', ['149.99', '299'])
    expect(f?.type).toBe('NUMBER')
    expect(f?.pattern).toContain('€')
  })

  it('écart % → pourcentage sans ×100 (valeurs déjà en %)', () => {
    expect(detectColumnFormat('ecart_pct', 'Écart %', ['12.7', '-5'])).toEqual({ type: 'NUMBER', pattern: '0.00"%"' })
  })

  it('entier long sans hint → TEXTE (identifiant, pas un nombre)', () => {
    expect(detectColumnFormat('gtin', 'Code', ['12345678901234'])?.type).toBe('TEXT')
  })

  it('valeurs numériques quelconques → nombre', () => {
    expect(detectColumnFormat('qte', 'Quantité', ['1', '42', '3.5'])).toEqual({ type: 'NUMBER', pattern: '#,##0.##' })
  })

  it('dates → format date', () => {
    expect(detectColumnFormat('maj', 'Mise à jour', ['2026-06-16', '2026-01-02'])?.type).toBe('DATE')
  })

  it('texte libre → null (laisser tel quel)', () => {
    expect(detectColumnFormat('produit', 'Produit', ['Tondeuse Ryobi', 'Taille-haie'])).toBeNull()
  })

  it('colonne vide → null', () => {
    expect(detectColumnFormat('x', 'X', ['', null, undefined])).toBeNull()
  })
})
