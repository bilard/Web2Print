import { describe, it, expect } from 'vitest'
import { Textbox } from 'fabric'
import { remapStylesToFabric, normalizeText } from './textboxConverter'
import type { TspanInfo } from './svgTextParser'

describe('textboxConverter', () => {
  it('remaps single tspan styles to Fabric format', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello World',
        cumulativeStart: 0,
        cumulativeEnd: 11,
        styles: { fill: 'red', fontSize: 16 },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Verify all characters on line 0 have the correct styles
    expect(result[0]).toBeDefined()
    for (let i = 0; i < 11; i++) {
      expect(result[0][i]?.fill).toBe('red')
      expect(result[0][i]?.fontSize).toBe(16)
    }
  })

  it('remaps multiple tspans with different styles', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
      {
        textContent: ' World',
        cumulativeStart: 5,
        cumulativeEnd: 11,
        styles: { fill: 'blue' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Verify "Hello" (chars 0-4) has red
    expect(result[0][0]?.fill).toBe('red')
    expect(result[0][4]?.fill).toBe('red')

    // Verify " World" (chars 5-10) has blue
    expect(result[0][5]?.fill).toBe('blue')
    expect(result[0][10]?.fill).toBe('blue')
  })

  it('normalizes whitespace for matching', () => {
    expect(normalizeText('Hello  World')).toBe('Hello World')
    expect(normalizeText('  Hello\n  World  ')).toBe('Hello World')
  })

  it('handles tspan matching with whitespace variation', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello  World',
        cumulativeStart: 0,
        cumulativeEnd: 12,
        styles: { fill: 'red' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Despite whitespace variation in tspan, should match and apply styles
    expect(result[0]).toBeDefined()
    expect(result[0][0]?.fill).toBe('red')
    expect(result[0][10]?.fill).toBe('red')
  })

  it('matches tspans in sequence', () => {
    const wrappedText = 'Hello Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
      {
        textContent: 'Hello',
        cumulativeStart: 5,
        cumulativeEnd: 10,
        styles: { fill: 'blue' },
      },
      {
        textContent: ' World',
        cumulativeStart: 10,
        cumulativeEnd: 16,
        styles: { fill: 'green' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // First "Hello" (chars 0-4) should be red
    expect(result[0][0]?.fill).toBe('red')
    expect(result[0][4]?.fill).toBe('red')

    // Second "Hello" (chars 6-10) should be blue
    expect(result[0][6]?.fill).toBe('blue')
    expect(result[0][10]?.fill).toBe('blue')

    // " World" (chars 11-16) should be green
    expect(result[0][11]?.fill).toBe('green')
    expect(result[0][16]?.fill).toBe('green')
  })

  it('applies styles correctly across multi-line wrapped text', () => {
    const wrappedText = 'Hello\nWorld'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
      {
        textContent: 'World',
        cumulativeStart: 5,
        cumulativeEnd: 10,
        styles: { fill: 'blue' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Verify line 0 has red styles for chars 0-4
    expect(result[0]).toBeDefined()
    expect(result[0][0]?.fill).toBe('red')
    expect(result[0][4]?.fill).toBe('red')

    // Verify line 1 has blue styles for chars 0-4
    expect(result[1]).toBeDefined()
    expect(result[1][0]?.fill).toBe('blue')
    expect(result[1][4]?.fill).toBe('blue')
  })

  it('gracefully skips tspan not found in wrapped text', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'NotFound',
        cumulativeStart: 0,
        cumulativeEnd: 8,
        styles: { fill: 'red' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Should return empty style map (no styles applied)
    expect(Object.keys(result).length).toBe(0)
  })

  it('handles empty wrapped text', () => {
    const wrappedText = ''
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    // Should return empty style map
    expect(Object.keys(result).length).toBe(0)
  })

  it('handles empty tspans array', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = []

    const result = remapStylesToFabric(wrappedText, tspans)

    // Should return empty style map
    expect(Object.keys(result).length).toBe(0)
  })

  // ------- Sanitisation des styles pour Fabric (régression import SVG) -------
  //
  // Fabric v6 stylesToArray (xi) compare les styles char-level via un set de clés
  // fermé : fill, stroke, fontSize, fontFamily, fontWeight, fontStyle, underline,
  // overline, linethrough, deltaY, textDecorationColor, textDecorationThickness,
  // textBackgroundColor. Si la map ne contient QUE des clés non reconnues
  // (textDecoration, baselineShift en string, letterSpacing), Fabric crashe à
  // l'appel toObject() — "Cannot read properties of undefined (reading 'end')".
  // remapStylesToFabric doit donc transformer/filtrer avant de poser les styles.

  it('produit des styles que Fabric.Textbox.toObject() peut sérialiser', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello World',
        cumulativeStart: 0,
        cumulativeEnd: 11,
        // Tspan qui ne porte QUE des propriétés non reconnues par Fabric.
        // Avant le fix : new Textbox + toObject() crashait.
        styles: { letterSpacing: 2, textDecoration: 'underline' },
      },
    ]

    const styleMap = remapStylesToFabric(wrappedText, tspans)
    const tb = new Textbox(wrappedText, { styles: styleMap as unknown as Record<number, Record<number, Record<string, unknown>>>, width: 200 })

    expect(() => tb.toObject()).not.toThrow()
  })

  it('convertit textDecoration en booléens underline/overline/linethrough', () => {
    const wrappedText = 'Hello'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { textDecoration: 'underline line-through' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)

    expect(result[0][0]?.underline).toBe(true)
    expect(result[0][0]?.linethrough).toBe(true)
    expect((result[0][0] as Record<string, unknown>).textDecoration).toBeUndefined()
  })

  it('mappe le decoration "overline" et ignore "none"', () => {
    const overlineRes = remapStylesToFabric('Hi', [
      { textContent: 'Hi', cumulativeStart: 0, cumulativeEnd: 2, styles: { textDecoration: 'overline' } },
    ])
    expect(overlineRes[0][0]?.overline).toBe(true)

    const noneRes = remapStylesToFabric('Hi', [
      { textContent: 'Hi', cumulativeStart: 0, cumulativeEnd: 2, styles: { textDecoration: 'none' } },
    ])
    // "none" produit un style vide — la map ne contient aucune entrée
    expect(Object.keys(noneRes).length).toBe(0)
  })

  it('drop letterSpacing (propriété non-char-level dans Fabric)', () => {
    const result = remapStylesToFabric('Hello', [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { letterSpacing: 2, fill: 'red' },
      },
    ])
    expect((result[0][0] as Record<string, unknown>).letterSpacing).toBeUndefined()
    expect(result[0][0]?.fill).toBe('red')
  })

  it('drop baselineShift en string (super/sub) et garde la valeur numérique en deltaY', () => {
    const supRes = remapStylesToFabric('Hi', [
      { textContent: 'Hi', cumulativeStart: 0, cumulativeEnd: 2, styles: { baselineShift: 'super', fill: 'red' } },
    ])
    expect((supRes[0][0] as Record<string, unknown>).baselineShift).toBeUndefined()
    expect((supRes[0][0] as Record<string, unknown>).deltaY).toBeUndefined()
    expect(supRes[0][0]?.fill).toBe('red')

    const numRes = remapStylesToFabric('Hi', [
      { textContent: 'Hi', cumulativeStart: 0, cumulativeEnd: 2, styles: { baselineShift: -3 } },
    ])
    expect((numRes[0][0] as Record<string, unknown>).deltaY).toBe(-3)
  })

  it("n'écrit aucune entrée char quand toutes les clés sont rejetées", () => {
    const result = remapStylesToFabric('Hello', [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        // letterSpacing + baselineShift string + textDecoration none → tout filtré
        styles: { letterSpacing: 5, baselineShift: 'sub', textDecoration: 'none' },
      },
    ])
    expect(Object.keys(result).length).toBe(0)
  })
})
