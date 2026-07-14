import { describe, it, expect } from 'vitest'
import { isGarbageContent, isMainlyGarbage } from '../parsers/garbageFilter'

describe('isGarbageContent', () => {
  it('détecte un bandeau cookies', () => {
    expect(isGarbageContent('We use cookies to improve your experience')).toBe(true)
  })

  it('détecte une mention GDPR française', () => {
    expect(isGarbageContent('Politique de confidentialité — Préférences cookies')).toBe(true)
  })

  it('détecte reCAPTCHA', () => {
    expect(isGarbageContent('Please complete the reCAPTCHA below')).toBe(true)
  })

  it('laisse passer un texte produit normal', () => {
    expect(isGarbageContent('Perceuse-visseuse 18V avec batterie Li-Ion')).toBe(false)
  })

  it('détecte OneTrust / Cookiebot', () => {
    expect(isGarbageContent('Powered by OneTrust')).toBe(true)
    expect(isGarbageContent('Cookiebot consent manager')).toBe(true)
  })
})

describe('isMainlyGarbage', () => {
  it('renvoie true si > 30% des lignes sont garbage', () => {
    const text = [
      'Cookie banner',
      'Accept all cookies',
      'Reject all',
      'Manage preferences',
      'Perceuse 18V',
    ].join('\n')
    expect(isMainlyGarbage(text)).toBe(true)
  })

  it('renvoie false sur du texte produit', () => {
    const text = [
      'Perceuse-visseuse compacte',
      'Batterie 18V Li-Ion incluse',
      'Couple maxi 60 Nm',
      'Mandrin auto-serrant 13 mm',
    ].join('\n')
    expect(isMainlyGarbage(text)).toBe(false)
  })

  it('renvoie false sur texte vide', () => {
    expect(isMainlyGarbage('')).toBe(false)
  })
})

// Fixture réelle trafic.com (2026-07-14, PATH B LLM) : le bloc « Nos 4
// promesses » (réassurance ENSEIGNE — parle du magasin, jamais du produit) et
// le boilerplate de galerie Magento ressortaient en avantages/description via
// la synthèse LLM. Vocabulaire de réassurance retail générique, jamais par site.
describe('isGarbageContent — réassurance enseigne + galerie (fixture Trafic)', () => {
  const JUNK = [
    'Laissez-vous séduire par un choix impressionnant, des offres et des collections exclusives',
    'Faites confiance à une qualité testée et validée',
    'des meilleurs prix garantis du marché',
    'une expérience chaleureuse et agréable',
    'Nos 4 promesses:',
    'Skip to the beginning of the images gallery',
    'Skip to the end of the images gallery',
  ]
  it.each(JUNK)('tue « %s »', (t) => {
    expect(isGarbageContent(t)).toBe(true)
  })
  const GOOD = [
    'Ventilateur de plafond silencieux avec télécommande, idéal pour la chambre',
    'La tour de ventilateur 3 vitesses blanche a 3 vitesses avec une puissance de 45W.',
    'Garantie fabricant de 10 ans (enregistrement requis)',
  ]
  it.each(GOOD)('garde « %s »', (t) => {
    expect(isGarbageContent(t)).toBe(false)
  })
})
