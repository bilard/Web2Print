import { describe, it, expect } from 'vitest'
import { validateSvgFonts } from './fontsValidator'

describe('validateSvgFonts', () => {
  const allowed = ['Inter', 'Montserrat', 'Playfair Display']

  it('ne détecte aucun problème si toutes les fonts sont autorisées', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter">A</text><text font-family="Montserrat">B</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts.sort()).toEqual(['Inter', 'Montserrat'])
  })

  it('détecte une font non autorisée', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="ComicSans">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toContain('ComicSans')
  })

  it('normalise font-family avec guillemets imbriqués', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="'Playfair Display'">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toContain('Playfair Display')
  })

  it('gère les font-family avec fallbacks : prend la première', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter, sans-serif">A</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toContain('Inter')
  })

  it('retourne une liste vide si aucune font référencée', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.missingFonts).toEqual([])
    expect(res.usedFonts).toEqual([])
  })

  it('dédoublonne les fonts utilisées', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Inter">A</text><text font-family="Inter">B</text></svg>`
    const res = validateSvgFonts(svg, allowed)
    expect(res.usedFonts).toEqual(['Inter'])
  })
})
