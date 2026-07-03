import { describe, expect, it } from 'vitest'
import { parseGoogleFontFamily } from './userFontsApi'

describe('parseGoogleFontFamily', () => {
  it('URL specimen fonts.google.com', () => {
    expect(parseGoogleFontFamily('https://fonts.google.com/specimen/Open+Sans')).toBe('Open Sans')
    expect(parseGoogleFontFamily('https://fonts.google.com/specimen/Chakra+Petch?query=chakra')).toBe('Chakra Petch')
  })
  it('URL css2 fonts.googleapis.com (avec graisses)', () => {
    expect(parseGoogleFontFamily('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap')).toBe('Roboto Condensed')
  })
  it('nom saisi tel quel', () => {
    expect(parseGoogleFontFamily('  Playfair   Display ')).toBe('Playfair Display')
  })
  it('URL inconnue → erreur explicite', () => {
    expect(() => parseGoogleFontFamily('https://exemple.com/font.css')).toThrow(/non reconnue/)
    expect(() => parseGoogleFontFamily('')).toThrow()
  })
})
