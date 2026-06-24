import { describe, it, expect } from 'vitest'
import { serializedTextFor } from './useAutoSave'

describe('serializedTextFor', () => {
  it('bloc IDML balisé (originText présent) → sérialise la VALEUR stable', () => {
    expect(serializedTextFor({ text: '49,90', data: { templateText: '{{Prix}}', originText: '22,99' } }))
      .toBe('22,99')
  })
  it("{{}} manuel (pas d'originText) → sérialise le template (comportement legacy)", () => {
    expect(serializedTextFor({ text: 'Jean', data: { templateText: '{{nom}}' } }))
      .toBe('{{nom}}')
  })
  it('bloc sans template → texte inchangé', () => {
    expect(serializedTextFor({ text: 'OFFRE', data: {} })).toBe('OFFRE')
  })
})
