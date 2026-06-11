// src/features/merge/autoMatch.test.ts
import { describe, it, expect } from 'vitest'
import { computeAutoMatch, type MatchableText, type ColumnLike } from './autoMatch'

const COLS: ColumnLike[] = [
  { key: 'name', label: 'Nom' },
  { key: 'price', label: 'Prix' },
  { key: 'description', label: 'Description' },
]

const t = (id: string, text: string, fontSize: number): MatchableText => ({ id, text, fontSize })

describe('computeAutoMatch', () => {
  it('prix = motif monétaire le plus gros, titre = plus grande taille restante, description = texte long', () => {
    const texts = [
      t('a', '9,99 €', 64),
      t('b', '+ d\'infos: 2,00 €', 12),
      t('c', 'Perceuse sans fil 18V', 36),
      t('d', 'Une perceuse robuste avec deux batteries incluses et un chargeur rapide pour tous vos travaux.', 14),
      t('e', 'PROMO', 28),
    ]
    const result = computeAutoMatch(texts, COLS)
    expect(result).toEqual([
      { id: 'a', columnKey: 'price', role: 'price' },
      { id: 'c', columnKey: 'name', role: 'title' },
      { id: 'd', columnKey: 'description', role: 'description' },
    ])
  })

  it('colonnes reconnues par label accentué (Désignation) et clés ai_*', () => {
    const cols: ColumnLike[] = [
      { key: 'col_12', label: 'Désignation' },
      { key: 'ai_price', label: 'Tarif relevé' },
    ]
    const result = computeAutoMatch([t('a', '12,50 €', 40), t('b', 'Marteau', 30)], cols)
    expect(result).toEqual([
      { id: 'a', columnKey: 'ai_price', role: 'price' },
      { id: 'b', columnKey: 'col_12', role: 'title' },
    ])
  })

  it('aucune colonne correspondante → aucune assignation', () => {
    expect(computeAutoMatch([t('a', '9,99 €', 40)], [{ key: 'x', label: 'Y' }])).toEqual([])
  })

  it('textes vides ou déjà liés (text vidé) ignorés', () => {
    expect(computeAutoMatch([t('a', '', 40), t('b', '  ', 30)], COLS)).toEqual([])
  })
})
