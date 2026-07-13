import { describe, it, expect } from 'vitest'
import { parseImagesFromHtml, expandSceneSevenGallery } from '../parsers/parseImagesFromHtml'

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

// Fixture réelle screwfix.fr (2026-07-13) : galerie produit sur Adobe Scene7 /
// Dynamic Media — URLs SANS extension (`/is/image/ae235?src=ae235/767RV_P&…`),
// membres du carrousel (767RV_A1…A7) présents dans le HTML mais jamais rendus
// en <img> statique. Convention Scene7 = générique (des milliers de retailers).
describe('expandSceneSevenGallery', () => {
  const HTML = `<meta property="og:image" content="https://media.screwfix.fr/is/image/ae235?src=ae235/767RV_P&amp;" />
    <script>var assets = ["767RV_P","767RV_A1","767RV_A2","767RV_A3","767RV_A4","767RV_A5","767RV_A6","767RV_A7"];</script>`

  it('déduit toute la galerie depuis le stem de l’asset og:image', () => {
    const base = parseImagesFromHtml(HTML)
    const all = expandSceneSevenGallery(HTML, base)
    const names = all.filter((u) => u.includes('/is/image/')).map((u) => u.match(/767RV_[A-Z0-9]+/)?.[0])
    expect(names).toContain('767RV_P')
    for (let i = 1; i <= 7; i++) expect(names).toContain(`767RV_A${i}`)
  })

  it('garde-fou : sans URL Scene7, la liste ressort inchangée', () => {
    const imgs = ['https://x.fr/media/catalog/product/p1.jpg']
    expect(expandSceneSevenGallery('<html><body>rien</body></html>', imgs)).toEqual(imgs)
  })
})

// Galerie JSON Magento (mage/gallery) : chaque vue expose thumb/img/full —
// `full` = pleine résolution ($prodImageLarge$), URLs parfois JSON-échappées.
describe('parseImagesFromHtml — galerie JSON embarquée (Magento)', () => {
  it('extrait les URLs « full » de la config de galerie', () => {
    const html = `<script>var cfg = [{"thumb":"https://m.x.fr/is/image/a?src=a/REF_A1&$t$","img":"https://m.x.fr/is/image/a?src=a/REF_A1&$m$","full":"https://m.x.fr/is/image/a?src=a/REF_A1&$l$"},{"full":"https:\\/\\/m.x.fr\\/is\\/image\\/a?src=a\\/REF_A2&$l$"}];</script>`
    const imgs = parseImagesFromHtml(html)
    expect(imgs).toContain('https://m.x.fr/is/image/a?src=a/REF_A1&$l$')
    expect(imgs).toContain('https://m.x.fr/is/image/a?src=a/REF_A2&$l$')
  })
  it('n’avale pas les URLs non-image (« full » pointant un .js)', () => {
    const html = `<script>{"full":"https://m.x.fr/bundle.js"}</script>`
    expect(parseImagesFromHtml(html)).toEqual([])
  })
})
