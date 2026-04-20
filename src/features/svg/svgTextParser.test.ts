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
    // Account for \n separator between tspans
    expect(result[0].tspans[1].cumulativeStart).toBe(6) // 5 (Hello) + 1 (\n)
    expect(result[0].tspans[1].cumulativeEnd).toBe(12) // 6 + " World".length
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

  it('recursively extracts nested tspan elements', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="150">
          <tspan fill="red">
            Outer
            <tspan fill="blue">Inner</tspan>
            More
          </tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    // Should find all tspan descendants recursively
    expect(result[0].tspans).toHaveLength(2)
    expect(result[0].tspans[0].textContent).toContain('Outer')
    expect(result[0].tspans[0].styles.fill).toBe('red')
    expect(result[0].tspans[1].textContent).toBe('Inner')
    expect(result[0].tspans[1].styles.fill).toBe('blue')
  })

  it('deeply nested tspans maintain cumulative positions', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="200">
          <tspan>A</tspan>
          <tspan>
            B
            <tspan>C</tspan>
          </tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans).toHaveLength(3)
    // First tspan: "A"
    expect(result[0].tspans[0].textContent).toContain('A')
    expect(result[0].tspans[0].cumulativeStart).toBe(0)
    expect(result[0].tspans[0].cumulativeEnd).toBeGreaterThanOrEqual(1)
    // Second tspan should start where first ended
    expect(result[0].tspans[1].cumulativeStart).toBeGreaterThanOrEqual(1)
    // Third nested tspan should follow
    expect(result[0].tspans[2].cumulativeStart).toBeGreaterThanOrEqual(result[0].tspans[1].cumulativeEnd)
  })

  it('handles baselineShift as string (super/sub keywords)', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan baseline-shift="super">Super</tspan>
          <tspan baseline-shift="sub">Sub</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans[0].styles.baselineShift).toBe('super')
    expect(result[0].tspans[1].styles.baselineShift).toBe('sub')
  })

  it('handles baselineShift as numeric value', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan baseline-shift="2.5">Numeric Shift</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans[0].styles.baselineShift).toBe(2.5)
  })

  it('attributes take precedence over inherited values', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100" fill="black">
          <tspan fill="red">Red Text</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    // tspan attribute should override text element style
    expect(result[0].tspans[0].styles.fill).toBe('red')
  })

  it('preserves empty and whitespace-only tspans', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan>Text</tspan>
          <tspan>   </tspan>
          <tspan></tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans).toHaveLength(3)
    expect(result[0].tspans[0].textContent).toBe('Text')
    expect(result[0].tspans[1].textContent).toBe('   ')
    expect(result[0].tspans[2].textContent).toBe('')
  })
})
