import { describe, it, expect } from 'vitest'
import { unwrapNeutralClipGroups } from './pdfToSvg'

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
