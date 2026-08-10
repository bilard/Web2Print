import { describe, it, expect } from 'vitest'
import { rewrittenInSheet, sheetOps } from './sheetRewrite'
import type { SourceProduct } from '../catalog/match'

const p = (over: Partial<SourceProduct> = {}): SourceProduct => ({
  id: 'x', name: 'Bobineau', ...over,
} as SourceProduct)

describe('rewrittenInSheet', () => {
  it('vrai quand la colonne jumelle porte un autre texte que le courant', () => {
    expect(rewrittenInSheet(p({
      description: 'Bobineau adaptable pour FLYMO modèles Cordless CT250.',
      descriptionSource: 'Spoel geschikt voor FLYMO modellen Cordless CT250.',
    }))).toBe(true)
  })
  it('vrai sur le seul NOM réécrit', () => {
    expect(rewrittenInSheet(p({ name: 'Bobineau', nameSource: 'Spoel' }))).toBe(true)
  })
  // ⚠ Sinon une fiche jamais traduite sortirait de la file parce que la feuille porte une
  // colonne jumelle vide de sens.
  it('faux quand l’original dit la même chose que le texte courant', () => {
    expect(rewrittenInSheet(p({ description: 'Bobineau  ', descriptionSource: 'BOBINEAU' }))).toBe(false)
  })
  it('faux sans colonne jumelle', () => {
    expect(rewrittenInSheet(p({ description: 'Bobineau adaptable' }))).toBe(false)
  })
})

describe('sheetOps', () => {
  it('déduit la traduction de la langue D’ORIGINE', () => {
    expect(sheetOps('nl')).toEqual({ translate: true, improve: false })
    expect(sheetOps('fr')).toEqual({ translate: false, improve: false })
  })
  it('ne conclut rien sans langue tranchée', () => {
    expect(sheetOps(null)).toEqual({ translate: false, improve: false })
  })
})
