import { describe, it, expect } from 'vitest'
import { looksLikeSpecValue, normalizeSpecPairs } from './normalizeSpecPairs'

describe('looksLikeSpecValue', () => {
  it('détecte les valeurs (nombre + unité, prix)', () => {
    expect(looksLikeSpecValue('15/30/- Nm')).toBe(true)
    expect(looksLikeSpecValue('1 / 10 mm')).toBe(true)
    expect(looksLikeSpecValue('215 x 95 x')).toBe(true)
    expect(looksLikeSpecValue('1,5 m/s²')).toBe(true)
    expect(looksLikeSpecValue('52,24 €')).toBe(true)
    expect(looksLikeSpecValue('HT')).toBe(true)
  })

  it('garde les libellés (mots, y compris commençant par un chiffre porteur de sens)', () => {
    expect(looksLikeSpecValue('Régime à vide')).toBe(false)
    expect(looksLikeSpecValue('Tension de la batterie')).toBe(false)
    expect(looksLikeSpecValue('Poids')).toBe(false)
    expect(looksLikeSpecValue('2ème vitesse')).toBe(false)
  })
})

describe('normalizeSpecPairs', () => {
  it('rejette les paires corrompues (nom en forme de valeur)', () => {
    const out = normalizeSpecPairs([
      { name: 'Poids', value: '0,95 kg' },
      { name: '15/30/- Nm', value: 'Régime à vide' }, // inversé/corrompu
      { name: '52,24 €', value: 'HT' },               // fragment prix
      { name: 'Max-Lang-Strasse 40-46', value: '70771 Leinfelden' }, // adresse (nom porte un nombre mais a un mot → gardé ici ; sanity aval le retire)
    ])
    const names = out.map((s) => s.name)
    expect(names).toContain('Poids')
    expect(names).not.toContain('15/30/- Nm')
    expect(names).not.toContain('52,24 €')
  })

  it('déduplique par nom normalisé (Poids ×2)', () => {
    const out = normalizeSpecPairs([
      { name: 'Poids', value: '0,95 kg' },
      { name: 'poids', value: '29aae2cf-uuid' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].value).toBe('0,95 kg')
  })
})
