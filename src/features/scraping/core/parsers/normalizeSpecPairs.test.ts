import { describe, it, expect } from 'vitest'
import { looksLikeSpecValue, normalizeSpecPairs, sanitizeSpecPair } from './normalizeSpecPairs'

describe('sanitizeSpecPair (valeurs source réelles Rubix/Makita)', () => {
  it('retire le crochet orphelin + le libellé auto-répété dans la valeur', () => {
    // Cas réels capturés en prod (fiche Makita DDF484RTJ) :
    expect(sanitizeSpecPair({ name: 'Couple max. fixation franc/élastique', value: ']Couple max. fixation franc/élastique: 54 / 30 Nm' }))
      .toEqual({ name: 'Couple max. fixation franc/élastique', value: '54 / 30 Nm' })
    expect(sanitizeSpecPair({ name: 'Réglage du couple', value: ']Réglage du couple: 21 positions' }))
      .toEqual({ name: 'Réglage du couple', value: '21 positions' })
  })

  it('ne touche jamais une paire déjà propre', () => {
    const clean = { name: 'Couple', value: '65 Nm' }
    expect(sanitizeSpecPair(clean)).toBe(clean) // même référence
    // Signes utiles préservés (pas de sur-strip) :
    expect(sanitizeSpecPair({ name: 'Température', value: '-5°C' }).value).toBe('-5°C')
    expect(sanitizeSpecPair({ name: 'Tolérance', value: '<0,5 mm' }).value).toBe('<0,5 mm')
  })

  it('ne retire le préfixe QUE si la tête == le nom (pas un « Type: » légitime)', () => {
    expect(sanitizeSpecPair({ name: 'Mandrin', value: 'Type: auto-serrant' }).value).toBe('Type: auto-serrant')
  })
})

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

  it('rejette le bruit anti-bot / formulaire / UUID (source polluée)', () => {
    const out = normalizeSpecPairs([
      { name: 'Poids', value: '0,95 kg' },
      { name: 'Verify', value: 'No Internet access' },
      { name: 'Please choose a subject', value: "I've tried several times but it won't submit" },
      { name: 'ID', value: '29aae2cf-97c1-cb53-f592-b1776abc1234' },
    ])
    expect(out.map((s) => s.name)).toEqual(['Poids'])
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
