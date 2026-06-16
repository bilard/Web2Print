import { describe, it, expect } from 'vitest'
import { htmlToText } from './brightData'

describe('htmlToText', () => {
  it('retire script/style/head et aplatit les espaces', () => {
    const html = '<head><title>X</title></head><body><style>.a{}</style>' +
      '<script>var a=1;</script><h1>Tondeuse   Ryobi</h1></body>'
    const t = htmlToText(html)
    expect(t).toBe('Tondeuse Ryobi')
    expect(t).not.toMatch(/var a|\.a\{/)
  })

  it('conserve les liens et sources d’images en [url] (EAN dans le chemin image)', () => {
    const html = '<a href="https://x.fr/p/123">Produit</a>' +
      '<img src="https://cdn.x.fr/4892210822604_CAFR.jpg">'
    const t = htmlToText(html)
    expect(t).toContain('[https://x.fr/p/123]')
    expect(t).toContain('[https://cdn.x.fr/4892210822604_CAFR.jpg]')
  })

  it('décode les entités courantes', () => {
    expect(htmlToText('<p>Prix&nbsp;: 199&euro;</p>')).toBe('Prix : 199€')
    expect(htmlToText('<p>R&amp;D &#233;</p>')).toBe('R&D é')
  })
})
