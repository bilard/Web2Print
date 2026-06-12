import { describe, it, expect } from 'vitest'
import { filterImagesByProductRef } from '../parsers/filterImagesByRef'
import { parseNamedDocLinks } from '../parsers/parseNamedDocLinks'

const CDN = 'https://fi.makitamedia.com/images/3_Makita/301_machines'
const GALLERY = [
  `${CDN}/30120_JPG_zoom/DDA351_D1CK.jpg`,
  `${CDN}/30118_PNG_web/DDA351Z_C2L0.png`,
  `${CDN}/30118_PNG_web/dda351rtj_pack.png`,
]
const FOREIGN = [
  `${CDN}/30118_PNG_web/DSL800RTEU_C2L0.png`,   // ponceuse girafe (carrousel)
  `${CDN}/30118_PNG_web/195584-2_C2L0.png`,     // chargeur (accessoire)
  `${CDN}/30118_PNG_web/DTW701_C2L0.png`,       // boulonneuse (machines connexes)
]

describe('filterImagesByProductRef', () => {
  it('ne garde que les vues portant la référence produit', () => {
    const result = filterImagesByProductRef([...GALLERY, ...FOREIGN], ['DDA351RTJ'])
    expect(result).toEqual(GALLERY)
  })

  it('matche aussi via le préfixe modèle (DDA351 sans suffixe commercial)', () => {
    const result = filterImagesByProductRef([GALLERY[0], FOREIGN[0], GALLERY[1]], ['DDA351RTJ'])
    expect(result).toEqual([GALLERY[0], GALLERY[1]])
  })

  it('liste inchangée sans référence exploitable', () => {
    const all = [...GALLERY, ...FOREIGN]
    expect(filterImagesByProductRef(all, [undefined, null, 'ab'])).toEqual(all)
  })

  it('liste inchangée si moins de 2 images matchent (CDN à noms hashés)', () => {
    const hashed = ['https://cdn.x/img/a1b2c3.jpg', 'https://cdn.x/img/d4e5f6.jpg', GALLERY[0]]
    expect(filterImagesByProductRef(hashed, ['DDA351RTJ'])).toEqual(hashed)
  })
})

describe('parseNamedDocLinks', () => {
  it('apparie le libellé visible avec le lien vide qui le suit (style Makita)', () => {
    const md = `## Document

 Déclaration de conformité CE

[](https://www.icmsmakita.eu/CMS/custom/fi/attachments/ec_declaration_conformity/DDA351.pdf)

 Notices

[](https://www.icmsmakita.eu/CMS/custom/fi/attachments/user_manuals/User_manuals_EU2/DDA351.pdf)

 vue éclatées

[](https://www.icmsmakita.eu/cms/custom/fi/attachments/part_drawings/FR/DDA351.pdf)
`
    const docs = parseNamedDocLinks(md)
    expect(docs).toEqual([
      { name: 'Déclaration de conformité CE', url: 'https://www.icmsmakita.eu/CMS/custom/fi/attachments/ec_declaration_conformity/DDA351.pdf' },
      { name: 'Notices', url: 'https://www.icmsmakita.eu/CMS/custom/fi/attachments/user_manuals/User_manuals_EU2/DDA351.pdf' },
      { name: 'vue éclatées', url: 'https://www.icmsmakita.eu/cms/custom/fi/attachments/part_drawings/FR/DDA351.pdf' },
    ])
  })

  it('ignore les liens vides précédés d\'un heading ou d\'un autre lien', () => {
    const md = `## Téléchargements

[](https://x.fr/a.pdf)

[doc B](https://x.fr/b.pdf)

[](https://x.fr/c.pdf)
`
    expect(parseNamedDocLinks(md)).toEqual([])
  })
})
