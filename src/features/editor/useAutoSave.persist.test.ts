import { describe, it, expect } from 'vitest'
import { serializedTextFor } from './useAutoSave'

describe('serializedTextFor', () => {
  // ── Blocs IDML balisés (originText présent) ───────────────────────────────

  it('IDML connecté → sérialise la VALEUR stable (originText)', () => {
    expect(serializedTextFor({ text: '49,90', data: { templateText: '{{Prix}}', originText: '22,99' } }, true))
      .toBe('22,99')
  })

  it("IDML déconnecté, texte édité → sérialise obj.text (pas l'ancien originText)", () => {
    // Scénario du bug CRITICAL : import → édition hors connexion → save
    // obj.text a été mis à jour par l'utilisateur ; originText est l'ancienne valeur
    expect(serializedTextFor({ text: '19,99', data: { templateText: '{{Prix}}', originText: '22,99' } }, false))
      .toBe('19,99')
  })

  it('IDML déconnecté, texte non édité → sérialise obj.text (= originText si identiques)', () => {
    expect(serializedTextFor({ text: '22,99', data: { templateText: '{{Prix}}', originText: '22,99' } }, false))
      .toBe('22,99')
  })

  it('IDML déconnecté, obj.text absent → repli sur originText', () => {
    expect(serializedTextFor({ data: { templateText: '{{Prix}}', originText: '22,99' } }, false))
      .toBe('22,99')
  })

  // ── {{}} manuel (legacy : templateText sans originText) ───────────────────

  it("{{}} manuel (pas d'originText) + connecté → sérialise le template", () => {
    expect(serializedTextFor({ text: 'Jean', data: { templateText: '{{nom}}' } }, true))
      .toBe('{{nom}}')
  })

  it("{{}} manuel (pas d'originText) + déconnecté → sérialise le template (comportement legacy)", () => {
    expect(serializedTextFor({ text: 'Jean', data: { templateText: '{{nom}}' } }, false))
      .toBe('{{nom}}')
  })

  // ── Blocs sans template ───────────────────────────────────────────────────

  it('bloc sans template → texte inchangé (connecté)', () => {
    expect(serializedTextFor({ text: 'OFFRE', data: {} }, true)).toBe('OFFRE')
  })

  it('bloc sans template → texte inchangé (déconnecté)', () => {
    expect(serializedTextFor({ text: 'OFFRE', data: {} }, false)).toBe('OFFRE')
  })
})
