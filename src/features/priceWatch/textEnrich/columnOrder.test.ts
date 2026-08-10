import { describe, it, expect } from 'vitest'
import { orderColumns } from './columnOrder'
import type { SourceProduct } from '../catalog/match'

const p = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'x', name: 'Courroie hexagonale de type AA78.', ...over,
} as SourceProduct)

const col = (key: string, before: string, after: string): [string, { before: string; after: string }] =>
  [key, { before, after }]

describe('orderColumns', () => {
  it('met le LIBELLÉ devant l’argumentaire, quel que soit l’ordre d’arrivée', () => {
    const cols = [
      col('TEXT_VENTE', 'Gladde zeskantriem', 'Courroie lisse hexagonale, série AA, longueur 2035mm.'),
      col('DESCRIPTION', 'Zeskantriem AA78', 'Courroie hexagonale de type AA78.'),
    ]
    expect(orderColumns(cols, p({ description: 'Courroie lisse hexagonale, série AA, longueur 2035mm.' }))
      .map(([k]) => k)).toEqual(['DESCRIPTION', 'TEXT_VENTE'])
  })
  it('reconnaît le libellé par son texte D’ORIGINE aussi', () => {
    const cols = [
      col('B', 'un argumentaire entier', 'un argumentaire entier'),
      col('A', 'Zeskantriem AA78', 'Courroie hexagonale de type AA78.'),
    ]
    expect(orderColumns(cols, p({ nameSource: 'Zeskantriem AA78' })).map(([k]) => k)).toEqual(['A', 'B'])
  })
  it('garde l’ordre d’arrivée quand rien ne se rattache au produit', () => {
    const cols = [col('Z', 'a', 'b'), col('A', 'c', 'd')]
    expect(orderColumns(cols, p()).map(([k]) => k)).toEqual(['Z', 'A'])
  })
})
