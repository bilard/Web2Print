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
