import { describe, it, expect } from 'vitest'
import { syncOriginTextOnEdit } from './useDataMerge'

describe('syncOriginTextOnEdit', () => {
  // ── Cas : déconnecté + bloc IDML ────────────────────────────────────────

  it('déconnecté + bloc IDML édité → originText suit obj.text', () => {
    const target = {
      text: '19,99',
      data: { originText: '22,99' } as Record<string, unknown>,
    }
    syncOriginTextOnEdit(target, false)
    expect(target.data.originText).toBe('19,99')
  })

  it('déconnecté + bloc IDML édité avec styles → originStyles mis à jour', () => {
    const styles = { 0: { 0: { fontSize: 14 } } }
    const data: Record<string, unknown> = { originText: '22,99' }
    const target = { text: '19,99', data, styles }
    syncOriginTextOnEdit(target, false)
    expect(data.originText).toBe('19,99')
    // originStyles est une copie profonde (pas la même référence)
    expect(data.originStyles).toEqual(styles)
    expect(data.originStyles).not.toBe(styles)
  })

  // ── Cas : connecté → NE doit PAS modifier originText ────────────────────

  it('connecté → originText inchangé (ne pollue pas la valeur stable)', () => {
    const target = {
      text: '49,90', // valeur de ligne résolue
      data: { originText: '22,99' } as Record<string, unknown>,
    }
    syncOriginTextOnEdit(target, true)
    expect(target.data.originText).toBe('22,99') // valeur stable préservée
  })

  // ── Cas : texte contient {{}} → NE doit PAS modifier originText ─────────

  it("déconnecté mais texte avec {{}} → originText inchangé", () => {
    const target = {
      text: '{{Prix}}',
      data: { originText: '22,99' } as Record<string, unknown>,
    }
    syncOriginTextOnEdit(target, false)
    expect(target.data.originText).toBe('22,99')
  })

  // ── Cas : pas de data.originText (bloc legacy {{}} manuel) ───────────────

  it('bloc sans originText → aucun effet', () => {
    const target = {
      text: 'Jean',
      data: { templateText: '{{nom}}' } as Record<string, unknown>,
    }
    syncOriginTextOnEdit(target, false)
    expect(target.data.originText).toBeUndefined()
  })

  it('data absent → aucun effet (pas de crash)', () => {
    const target: { text: string; data?: Record<string, unknown> } = { text: 'texte' }
    expect(() => syncOriginTextOnEdit(target, false)).not.toThrow()
  })
})
