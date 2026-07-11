import { describe, it, expect } from 'vitest'
import { parseNamedDocLinks } from '../parsers/parseNamedDocLinks'

describe('parseNamedDocLinks', () => {
  it('apparie un lien vide avec le libellé de la ligne au-dessus', () => {
    const md = `Déclaration de conformité CE
[](https://cdn.makita.fr/docs/DDA351.pdf)
`
    expect(parseNamedDocLinks(md)).toEqual([
      { name: 'Déclaration de conformité CE', url: 'https://cdn.makita.fr/docs/DDA351.pdf' },
    ])
  })

  // Extrait RÉEL Castorama (2026-07-11) : lien TITRÉ avec icône imbriquée et
  // URL Scene7 SANS extension .pdf (`…7290106928435_int_frpdf`).
  it('capture les liens titrés dont l’URL est un document sans extension', () => {
    const md = `#### Guide d'installation

*   [![Image 28](https://www.castorama.fr/_assets/r/graphics/health--safety-other-400010_dop)Téléchargez la notice de montage](https://media.castorama.fr/is/content/Castorama/7290106928435_int_frpdf)
`
    expect(parseNamedDocLinks(md)).toEqual([
      { name: 'Téléchargez la notice de montage', url: 'https://media.castorama.fr/is/content/Castorama/7290106928435_int_frpdf' },
    ])
  })

  it('ignore les liens titrés vers des pages classiques', () => {
    const md = `[Voir les conditions des offres en cours](https://www.castorama.fr/mentions-legales-promotions)`
    expect(parseNamedDocLinks(md)).toEqual([])
  })
})
