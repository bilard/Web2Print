import { describe, it, expect } from 'vitest'
import { isTruncated, completeOriginText, originForDisplay, madeOnTruncatedSource } from './fullSaleText'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

const p = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'x', name: 'Bobineau 1601000', ...over,
} as SourceProduct)

const rev = (over: Partial<TextRevision> = {}): TextRevision => ({
  productId: 'x', at: 0, ...over,
})

describe('isTruncated', () => {
  it('reconnaît la coupe à son ellipse finale, espaces compris', () => {
    expect(isTruncated('Revolution 2300 (single line), R…')).toBe(true)
    expect(isTruncated('texte entier.  ')).toBe(false)
    expect(isTruncated(undefined)).toBe(false)
  })
})

describe('completeOriginText', () => {
  it('prend le PLUS LONG des textes d’origine non coupés', () => {
    expect(completeOriginText(p({ description: 'court' }), rev({
      byColumn: { TEXT_VENTE: { before: 'un argumentaire entier et long', after: '…' } },
    }))).toBe('un argumentaire entier et long')
  })
  it('ignore les candidats eux-mêmes coupés', () => {
    expect(completeOriginText(p({ description: 'très long mais coupé au bout…' }), rev({
      byColumn: { T: { before: 'bref', after: 'x' } },
    }))).toBe('bref')
  })
  it('ne rend rien quand tout est coupé', () => {
    expect(completeOriginText(p({ description: 'coupé…' }))).toBeUndefined()
  })
})

describe('originForDisplay', () => {
  it('affiche le catalogue tel quel quand il n’est pas coupé', () => {
    expect(originForDisplay(p({ description: 'entier' }))).toEqual({ text: 'entier', truncated: false })
  })
  it('remplace un texte coupé par la cellule entière de la feuille', () => {
    expect(originForDisplay(p({ description: 'Compatible avec les modèles…' }), rev({
      byColumn: { TEXT_VENTE: { before: 'Compatible avec les modèles A, B, C.', after: 'x' } },
    }))).toEqual({ text: 'Compatible avec les modèles A, B, C.', truncated: false })
  })
  it('signale la coupe quand aucun texte entier n’existe', () => {
    expect(originForDisplay(p({ description: 'Compatible…' }))).toEqual({ text: 'Compatible…', truncated: true })
  })
})

describe('madeOnTruncatedSource', () => {
  it('vrai quand la réécriture est coupée ET qu’un texte entier existe', () => {
    expect(madeOnTruncatedSource(p({ description: 'src…' }), rev({
      description: 'traduction coupée…',
      byColumn: { T: { before: 'la source entière au complet', after: 'x' } },
    }))).toBe(true)
  })
  it('faux sans texte entier de rechange — relancer redonnerait la même coupe', () => {
    expect(madeOnTruncatedSource(p({ description: 'src…' }), rev({ description: 'coupée…' }))).toBe(false)
  })
  it('faux sur une réécriture entière', () => {
    expect(madeOnTruncatedSource(p({ description: 'src entière' }), rev({ description: 'traduction entière' })))
      .toBe(false)
  })
})
