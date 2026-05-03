import { describe, it, expect } from 'vitest'
import { buildManufacturerSearchUrl, extractProductReference } from '../manufacturerFallback'

describe('extractProductReference', () => {
  it('extrait référence Makita DHR202Z depuis titre', () => {
    expect(extractProductReference('Perforateur Makita DHR202Z 18V Li-Ion')).toBe('DHR202Z')
  })
  it('extrait référence Bosch GBH-2-26 depuis titre', () => {
    const ref = extractProductReference('Bosch GBH 2-26 perforateur')
    expect(ref).toMatch(/^GBH[\s-]?2-26$/)
  })
  it('retourne null si pas de pattern reconnu', () => {
    expect(extractProductReference('Une serre de jardin polycarbonate')).toBeNull()
  })
})

describe('buildManufacturerSearchUrl', () => {
  it('construit URL search Makita', () => {
    const url = buildManufacturerSearchUrl('makita', 'DHR202Z')
    expect(url).toMatch(/makita\.fr/i)
    expect(url).toContain('DHR202Z')
  })
  it('retourne null si marque inconnue', () => {
    const url = buildManufacturerSearchUrl('unknown-brand', 'XYZ')
    expect(url).toBeNull()
  })
})
