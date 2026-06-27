import { describe, it, expect } from 'vitest'
import { parseImagesFromHtml } from '../parsers/parseImagesFromHtml'

describe('parseImagesFromHtml', () => {
  // Fixture RÉELLE (Milwaukee M18 FPD3) : URLs avec entités `&amp;` + vignettes width=64&blur.
  const milwaukee = `
    <img src="https://static.milwaukeetool.eu/remote.axd/img/m18_fpd3-502x--hero_1.jpg?v=ABC&amp;width=64&amp;blur=70&amp;sigma=1.5" />
    <img data-src="https://static.milwaukeetool.eu/remote.axd/img/m18_fpd3-502x--app_1.jpg?v=DEF&amp;width=64&amp;heightratio=1&amp;mode=crop" />
    <meta property="og:image" content="https://static.milwaukeetool.eu/remote.axd/img/m18_fpd3-0--hero_1.png?v=GHI" />
  `

  it('décode les entités HTML (&amp; → &)', () => {
    const urls = parseImagesFromHtml(milwaukee)
    expect(urls.every((u) => !u.includes('&amp;'))).toBe(true)
  })

  it('retire les paramètres de vignette (width=64/blur) → pleine résolution', () => {
    const urls = parseImagesFromHtml(milwaukee)
    const hero = urls.find((u) => u.includes('hero_1.jpg'))
    expect(hero).toBeDefined()
    expect(hero).not.toMatch(/width=64|blur=/)
    expect(hero).toContain('v=ABC') // garde la clé de version
  })

  it('capte <img>, data-src et og:image', () => {
    const urls = parseImagesFromHtml(milwaukee)
    expect(urls.some((u) => u.includes('hero_1.jpg'))).toBe(true)
    expect(urls.some((u) => u.includes('app_1.jpg'))).toBe(true)
    expect(urls.some((u) => u.includes('hero_1.png'))).toBe(true)
  })

  it('extrait chaque candidat d\'un srcset', () => {
    const html = `<img srcset="https://cdn.test/a.jpg 320w, https://cdn.test/b.jpg 640w" />`
    const urls = parseImagesFromHtml(html)
    expect(urls).toContain('https://cdn.test/a.jpg')
    expect(urls).toContain('https://cdn.test/b.jpg')
  })

  it('ignore les sources non-http (data:, relatives) et le HTML vide', () => {
    expect(parseImagesFromHtml('')).toEqual([])
    const urls = parseImagesFromHtml(`<img src="data:image/png;base64,AAAA" /><img src="/local/x.jpg" />`)
    expect(urls).toEqual([])
  })
})
