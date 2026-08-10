import { describe, it, expect } from 'vitest'
import {
  isTruncated, wholeVersionOf, completeOriginText, originForDisplay, madeOnTruncatedSource,
} from './fullSaleText'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

const p = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'x', name: 'Bobineau 1601000', ...over,
} as SourceProduct)

const rev = (over: Partial<TextRevision> = {}): TextRevision => ({
  productId: 'x', at: 0, ...over,
})

/** Ce que le catalogue écrit : `texte.slice(0, max) + '…'`. */
const cut = (s: string, max: number) => s.slice(0, max) + '…'
const WHOLE = 'Compatible avec les modèles CT250, ET20, MET230 et Revolution 2300 (single line).'

describe('isTruncated', () => {
  it('reconnaît la coupe à son ellipse finale, espaces compris', () => {
    expect(isTruncated('Revolution 2300 (single line), R…')).toBe(true)
    expect(isTruncated('texte entier.  ')).toBe(false)
    expect(isTruncated(undefined)).toBe(false)
  })
})

describe('wholeVersionOf', () => {
  it('reconstitue la cellule entière de la feuille, prouvée par son préfixe', () => {
    expect(wholeVersionOf(cut(WHOLE, 40), p(), rev({
      byColumn: { TEXT_VENTE: { before: WHOLE, after: 'x' } },
    }))).toBe(WHOLE)
  })
  // ⚠ LE test qui distingue « la bonne colonne » de « la plus longue » : sans la preuve par
  // préfixe, un tableau de specs finirait recopié dans le texte de vente.
  it('REFUSE une colonne plus longue qui n’est pas la suite du moignon', () => {
    expect(wholeVersionOf(cut(WHOLE, 40), p(), rev({
      byColumn: { SPECS: { before: 'Poids 1,2 kg · Ø fil 1,3 mm · longueur 8 m · coque plastique renforcée', after: 'x' } },
    }))).toBeUndefined()
  })
  it('ignore les candidats eux-mêmes coupés', () => {
    expect(wholeVersionOf(cut(WHOLE, 40), p(), rev({
      byColumn: { T: { before: cut(WHOLE, 60), after: 'x' } },
    }))).toBeUndefined()
  })
  it('ne touche pas un texte entier', () => {
    expect(wholeVersionOf(WHOLE, p({ description: WHOLE }))).toBeUndefined()
  })
})

describe('completeOriginText', () => {
  it('prend l’original mémorisé quand il est entier', () => {
    expect(completeOriginText(p({ description: 'texte courant' }), rev({ descriptionSource: WHOLE })))
      .toBe(WHOLE)
  })
  it('répare un original mémorisé coupé', () => {
    expect(completeOriginText(p(), rev({
      descriptionSource: cut(WHOLE, 40),
      byColumn: { TEXT_VENTE: { before: WHOLE, after: 'x' } },
    }))).toBe(WHOLE)
  })
  it('ne rend rien quand la coupe n’est pas réparable', () => {
    expect(completeOriginText(p({ description: cut(WHOLE, 40) }))).toBeUndefined()
  })
})

describe('originForDisplay', () => {
  it('affiche le catalogue tel quel quand il n’est pas coupé', () => {
    expect(originForDisplay(p({ description: 'entier' }))).toEqual({ text: 'entier', truncated: false })
  })
  it('remplace un texte coupé par la cellule entière de la feuille', () => {
    expect(originForDisplay(p({ description: cut(WHOLE, 40) }), rev({
      byColumn: { TEXT_VENTE: { before: WHOLE, after: 'x' } },
    }))).toEqual({ text: WHOLE, truncated: false })
  })
  it('signale la coupe quand aucun texte entier ne se certifie', () => {
    expect(originForDisplay(p({ description: cut(WHOLE, 40) }), rev({
      byColumn: { SPECS: { before: 'Poids 1,2 kg · Ø fil 1,3 mm · longueur 8 m', after: 'x' } },
    }))).toEqual({ text: cut(WHOLE, 40), truncated: true })
  })
})

describe('madeOnTruncatedSource', () => {
  it('vrai quand la réécriture est coupée ET que l’original entier se reconstitue', () => {
    expect(madeOnTruncatedSource(p({ description: cut(WHOLE, 40) }), rev({
      description: 'Ce bobineau est adaptable aux appareils FLYMO, R…',
      descriptionSource: cut(WHOLE, 40),
      byColumn: { TEXT_VENTE: { before: WHOLE, after: 'x' } },
    }))).toBe(true)
  })
  it('faux sans original entier — relancer redonnerait la même coupe', () => {
    expect(madeOnTruncatedSource(p({ description: cut(WHOLE, 40) }), rev({
      description: 'traduction coupée…', descriptionSource: cut(WHOLE, 40),
    }))).toBe(false)
  })
  it('faux sur une réécriture entière', () => {
    expect(madeOnTruncatedSource(p({ description: WHOLE }), rev({ description: 'traduction entière' })))
      .toBe(false)
  })
  it('faux sur un NOM coupé : la reprise ne sait pas le réparer', () => {
    expect(madeOnTruncatedSource(p({ description: WHOLE }), rev({
      name: 'Bobineau adaptable FLYMO Mc CUL…', description: 'texte entier', descriptionSource: WHOLE,
    }))).toBe(false)
  })
})
