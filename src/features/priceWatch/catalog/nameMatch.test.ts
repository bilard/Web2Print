import { describe, it, expect } from 'vitest'
import { nameTokens, buildNameIndex, nameMatchCandidates } from './nameMatch'
import type { CompetitorListing } from './competitorListing'

const L = (name: string): CompetitorListing => ({ url: 'u', name })

describe('nameTokens', () => {
  it('extrait les tokens significatifs, coupe « Origine: », retire accents et mots vides', () => {
    expect(nameTokens('Lame pour scarificateur électrique FLEURELLE - Origine: 12345'))
      .toEqual(['lame', 'scarificateur', 'electrique', 'fleurelle'])
  })
  it('retire mots vides et tokens < 3 caractères', () => {
    expect(nameTokens('Vis de M8 et rondelle')).toEqual(['vis', 'rondelle']) // de/et vides, m8→m8? non: 'm8' fait 2… garde 'vis','rondelle'
  })
})

describe('nameMatchCandidates', () => {
  const index = buildNameIndex([
    L('Lame de scarificateur FLEURELLE 32cm'),
    L('Courroie trapézoïdale A97'),
    L('Vis M8'),
  ])
  it('trouve un candidat pour un nom distinctif', () => {
    const c = nameMatchCandidates('Lame pour scarificateur électrique FLEURELLE', index)
    expect(c.length).toBe(1)
    expect(c[0].common).toBeGreaterThanOrEqual(3)
    expect(c[0].score).toBeGreaterThanOrEqual(0.6)
  })
  it('ne renvoie RIEN pour un nom générique (garde-fou anti faux positifs)', () => {
    expect(nameMatchCandidates('Vis', index)).toEqual([])
  })
  it('ne renvoie rien quand trop peu de tokens sont communs', () => {
    expect(nameMatchCandidates('Courroie plate B50 renforcée spéciale', index)).toEqual([])
  })
})
