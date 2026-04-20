import { describe, it, expect } from 'vitest'
import { parseTextElements } from './svgTextParser'

describe('svgTextParser', () => {
  it('extracts text and width from SVG with single tspan', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20" width="150" font-size="16" fill="black">
          <tspan>Hello World</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    expect(result[0].width).toBe(150)
    expect(result[0].tspans).toHaveLength(1)
    expect(result[0].tspans[0].textContent).toBe('Hello World')
  })

  it('extracts multiple tspans with individual styles', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20" width="200">
          <tspan fill="red" font-weight="bold">Bold Red</tspan>
          <tspan fill="blue" font-style="italic">Italic Blue</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans).toHaveLength(2)
    expect(result[0].tspans[0].styles.fill).toBe('red')
    expect(result[0].tspans[0].styles.fontWeight).toBe('bold')
    expect(result[0].tspans[1].styles.fill).toBe('blue')
    expect(result[0].tspans[1].styles.fontStyle).toBe('italic')
  })

  it('computes cumulative start/end positions for each tspan', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan>Hello</tspan>
          <tspan> World</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans[0].cumulativeStart).toBe(0)
    expect(result[0].tspans[0].cumulativeEnd).toBe(5) // "Hello".length
    expect(result[0].tspans[1].cumulativeStart).toBe(5)
    expect(result[0].tspans[1].cumulativeEnd).toBe(11) // "Hello World".length
  })

  it('handles text without tspan children', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20" width="100">Direct Text Content</text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    expect(result[0].width).toBe(100)
    expect(result[0].tspans).toHaveLength(1)
    expect(result[0].tspans[0].textContent).toBe('Direct Text Content')
  })

  it('extracts all SVG text style attributes', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan
            fill="red"
            font-family="Arial"
            font-size="14"
            font-weight="600"
            font-style="italic"
            text-decoration="underline"
            baseline-shift="2"
            letter-spacing="1.5"
          >
            Styled
          </tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    const styles = result[0].tspans[0].styles
    expect(styles.fill).toBe('red')
    expect(styles.fontFamily).toBe('Arial')
    expect(styles.fontSize).toBe(14)
    expect(styles.fontWeight).toBe('600')
    expect(styles.fontStyle).toBe('italic')
    expect(styles.textDecoration).toBe('underline')
    expect(styles.baselineShift).toBe(2)
    expect(styles.letterSpacing).toBe(1.5)
  })

  it('ignores text elements without width', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100"><tspan>Has Width</tspan></text>
        <text><tspan>No Width</tspan></text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    expect(result[0].tspans[0].textContent).toBe('Has Width')
  })
})
