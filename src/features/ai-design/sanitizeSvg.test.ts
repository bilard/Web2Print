import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from './sanitizeSvg'

describe('sanitizeSvg', () => {
  it('retire les <script>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).toContain('<rect')
  })

  it('retire les attributs on*', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="foo()" onload="bar()"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toMatch(/onclick|onload/)
  })

  it('retire <foreignObject>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe/></foreignObject></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('iframe')
  })

  it('rejette href javascript:', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('rejette xlink:href javascript:', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="javascript:alert(1)"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('javascript:')
  })

  it('conserve data: URIs sur <image>', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBOR"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('data:image/png;base64,iVBOR')
  })

  it('conserve placeholder: URIs (protocole custom pour image-slots)', () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg"><image href="placeholder:hero"/></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).toContain('placeholder:hero')
  })

  it('throw si le SVG est invalide', () => {
    expect(() => sanitizeSvg('not svg at all')).toThrow(/SVG/)
  })

  it('throw si pas de balise racine <svg>', () => {
    expect(() => sanitizeSvg('<div></div>')).toThrow(/svg/i)
  })
})
