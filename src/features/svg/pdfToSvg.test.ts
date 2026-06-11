import { describe, it, expect } from 'vitest'
import { unwrapNeutralClipGroups, dedupeMupdfTexts, groupMupdfTextBlocks } from './pdfToSvg'

/** SVG minimal façon mutool : page 200×280, un groupe de contenu clippé à la
 *  carte (non neutre) et un groupe de marques d'impression clippé pleine page. */
const MUPDF_LIKE = `<svg xmlns="http://www.w3.org/2000/svg" width="203.732" height="286.433" viewBox="0 0 203.732 286.433">
<defs>
<clipPath id="clip_card"><path d="M21 30H182.732V265.43299H21Z"/></clipPath>
<clipPath id="clip_page"><path d="M0 0H203.732V286.433H0Z"/></clipPath>
</defs>
<g clip-path="url(#clip_card)"><rect x="21" y="30" width="161" height="235"/></g>
<text x="50" y="100">PRIX</text>
<g clip-path="url(#clip_page)">
<path d="M0 0H6" stroke="#000"/>
<path d="M197 280H203" stroke="#000"/>
<text x="0" y="283">slug.indd 1</text>
</g>
</svg>`

describe('unwrapNeutralClipGroups', () => {
  it('déballe le groupe clippé pleine page (marques de coupe) à la racine', () => {
    const out = unwrapNeutralClipGroups(MUPDF_LIKE)
    const dom = new DOMParser().parseFromString(out, 'image/svg+xml')
    const root = dom.documentElement
    // Plus aucun <g> référençant le clip pleine page
    expect(out).not.toContain('url(#clip_page)')
    // Ses enfants (marques + slug) sont remontés à la racine
    const topPaths = Array.from(root.children).filter((el) => el.tagName === 'path')
    expect(topPaths).toHaveLength(2)
    const topTexts = Array.from(root.children).filter((el) => el.tagName === 'text')
    expect(topTexts.map((t) => t.textContent)).toEqual(['PRIX', 'slug.indd 1'])
  })

  it('conserve le groupe au clip NON neutre (carte rognée)', () => {
    const out = unwrapNeutralClipGroups(MUPDF_LIKE)
    expect(out).toContain('clip-path="url(#clip_card)"')
  })

  it('ne touche pas un groupe pleine page portant un autre attribut', () => {
    const svg = MUPDF_LIKE.replace('<g clip-path="url(#clip_page)">', '<g clip-path="url(#clip_page)" transform="matrix(2,0,0,2,0,0)">')
    const out = unwrapNeutralClipGroups(svg)
    expect(out).toContain('url(#clip_page)')
  })
})

const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280">${body}</svg>`

describe('dedupeMupdfTexts', () => {
  it('supprime la passe blanche sous la passe encrée (même texte, même position)', () => {
    const out = dedupeMupdfTexts(wrap(
      '<text x="0" y="283.4" font-size="6" fill="#ffffff">slug.indd 1</text>' +
      '<text x="0" y="283.4" font-size="6">slug.indd 1</text>',
    ))
    const dom = new DOMParser().parseFromString(out, 'image/svg+xml')
    const texts = Array.from(dom.querySelectorAll('text'))
    expect(texts).toHaveLength(1)
    expect(texts[0].getAttribute('fill')).toBeNull() // la passe encrée (dernière) survit
  })

  it('garde deux textes identiques à des positions différentes', () => {
    const out = dedupeMupdfTexts(wrap(
      '<text x="0" y="10" font-size="6">22</text>' +
      '<text x="50" y="10" font-size="6">22</text>',
    ))
    expect(new DOMParser().parseFromString(out, 'image/svg+xml').querySelectorAll('text')).toHaveLength(2)
  })
})

describe('groupMupdfTextBlocks', () => {
  // Positions réelles du PDF Monoprix (prix « 22 DT ,99 » rouge + bulle « 30 % » blanche à 7.5 pt)
  const PRICE_AND_BADGE =
    '<text x="88.7" y="120.4" font-size="30" fill="#d2232a">22</text>' +
    '<text x="112.5" y="105.4" font-size="10" fill="#d2232a">DT</text>' +
    '<text x="113.1" y="120.4" font-size="15" fill="#d2232a">,99</text>' +
    '<text x="136.9" y="108.4" font-size="23" fill="#ffffff">30</text>' +
    '<text x="150.6" y="108.4" font-size="14" fill="#ffffff">%</text>'

  it('regroupe les fragments voisins de même couleur, sépare les couleurs', () => {
    const out = groupMupdfTextBlocks(wrap(PRICE_AND_BADGE))
    const dom = new DOMParser().parseFromString(out, 'image/svg+xml')
    const groups = Array.from(dom.querySelectorAll('g'))
    expect(groups).toHaveLength(2)
    const labels = groups.map((g) => Array.from(g.children).map((t) => t.textContent).join(' '))
    expect(labels).toContain('22 DT ,99')
    expect(labels).toContain('30 %')
  })

  it('laisse les champs de fusion {{…}} top-level (le merge ne descend pas dans les groupes)', () => {
    const out = groupMupdfTextBlocks(wrap(
      '<text x="100" y="206" font-size="9" fill="#0054a6">{{Libelle Article}}</text>' +
      '<text x="100" y="216" font-size="9" fill="#0054a6">{{brands}}</text>',
    ))
    expect(new DOMParser().parseFromString(out, 'image/svg+xml').querySelectorAll('g')).toHaveLength(0)
  })

  it('ne groupe pas les textes rotatés (transform conservé)', () => {
    const out = groupMupdfTextBlocks(wrap(
      '<text x="10" y="100" font-size="10" fill="#ffffff" transform="rotate(-90 10 100)">OFFRE</text>' +
      '<text x="12" y="110" font-size="10" fill="#ffffff" transform="rotate(-90 12 110)">PROMO</text>',
    ))
    expect(new DOMParser().parseFromString(out, 'image/svg+xml').querySelectorAll('g')).toHaveLength(0)
  })
})
