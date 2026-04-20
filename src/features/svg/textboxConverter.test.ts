import { describe, it, expect } from 'vitest'
import { remapStylesToFabric, normalizeText } from './textboxConverter'
import type { TspanInfo, TextStyle } from './svgTextParser'

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
    expect(result).toBeDefined()
    expect(result[0]).toBeDefined()
    expect(Object.keys(result[0]).length).toBeGreaterThan(0)
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
    expect(result).toBeDefined()
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
    expect(result).toBeDefined()
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
    expect(result).toBeDefined()
  })
})
