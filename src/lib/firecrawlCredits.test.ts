import { describe, it, expect } from 'vitest'
import { parseFirecrawlCredits } from './firecrawlCredits'

describe('parseFirecrawlCredits', () => {
  it('lit le solde de la forme v2 courante (data.remaining_credits)', () => {
    expect(parseFirecrawlCredits({ success: true, data: { remaining_credits: 2870, plan_credits: 3000 } }))
      .toEqual({ remaining: 2870, total: 3000 })
  })

  it('lit un solde à plat, sans enveloppe', () => {
    expect(parseFirecrawlCredits({ remainingCredits: 12 }).remaining).toBe(12)
  })

  it("prend un champ « credits » nu pour le solde quand rien ne parle de « remaining »", () => {
    expect(parseFirecrawlCredits({ data: { credits: 500 } }).remaining).toBe(500)
  })

  it("ne prend PAS le CONSOMMÉ pour un solde — un compte à sec passerait pour plein", () => {
    expect(parseFirecrawlCredits({ data: { credits_used: 4200 } })).toEqual({})
  })

  it('rend un objet vide sur une réponse hors sujet plutôt qu’un zéro trompeur', () => {
    expect(parseFirecrawlCredits({ error: 'unauthorized' })).toEqual({})
    expect(parseFirecrawlCredits(null)).toEqual({})
    expect(parseFirecrawlCredits('nope')).toEqual({})
  })

  it('descend dans les structures imbriquées mais borne la profondeur', () => {
    const deep = { a: { b: { c: { d: { remaining_credits: 7 } } } } }
    expect(parseFirecrawlCredits(deep).remaining).toBe(7)
    // 8 niveaux : au-delà de la borne, on préfère « inconnu » à une exploration sans fin.
    const tooDeep = { a: { b: { c: { d: { e: { f: { g: { h: { remaining_credits: 7 } } } } } } } } }
    expect(parseFirecrawlCredits(tooDeep)).toEqual({})
  })
})
