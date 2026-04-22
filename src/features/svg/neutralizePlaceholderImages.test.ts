import { describe, it, expect } from 'vitest'
import { neutralizePlaceholderImages } from './neutralizePlaceholderImages'

describe('neutralizePlaceholderImages', () => {
  it('remplace <image href="placeholder:..."> par <rect>', () => {
    const svg = '<svg><image href="placeholder:hero" x="10" y="20" width="100" height="150" data-role="image-slot"/></svg>'
    const result = neutralizePlaceholderImages(svg)
    expect(result).toContain('<rect')
    expect(result).not.toContain('placeholder:')
    expect(result).toContain('x="10"')
    expect(result).toContain('width="100"')
  })

  it('remplace <image xlink:href="placeholder:..."> par <rect>', () => {
    const svg = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="placeholder:hero" x="10" y="20" width="100" height="150" data-role="image-slot"/></svg>'
    const result = neutralizePlaceholderImages(svg)
    expect(result).toContain('<rect')
    expect(result).not.toContain('placeholder:')
    expect(result).toContain('x="10"')
  })

  it('préserve les attributs data-role et data-id', () => {
    const svg = '<svg><image href="placeholder:product" x="0" y="0" width="100" height="100" data-role="product" data-id="prod-123"/></svg>'
    const result = neutralizePlaceholderImages(svg)
    expect(result).toContain('data-role="product"')
    expect(result).toContain('data-id="prod-123"')
  })

  it('laisse intactes les <image> non-placeholder', () => {
    const svg = '<svg><image href="data:image/png;base64,xxx" x="0" y="0" width="100" height="100"/></svg>'
    const result = neutralizePlaceholderImages(svg)
    expect(result).toContain('data:image/png;base64,xxx')
    expect(result).not.toContain('<rect')
  })

  it('remplace <image> avec single quotes href="placeholder:..." (BUG)', () => {
    // Ce test FAIL car la regex ne couvre que double quotes
    const svg = "<svg><image href='placeholder:hero' x='10' y='20' width='100' height='150' data-role='image-slot'/></svg>"
    const result = neutralizePlaceholderImages(svg)
    // Cette assertion va FAIL car le <image> ne sera pas remplacé par <rect>
    expect(result).not.toContain("href='placeholder:")
    expect(result).toContain('<rect')
  })
})
