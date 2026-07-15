import { describe, it, expect } from 'vitest'
import {
  htmlBoldToMarkers,
  stripBoldMarkers,
  hasBoldMarkers,
  normalizeBoldMarkers,
  parseBoldRuns,
  boldMarkdownToHtml,
  descriptionMarkdownToHtml,
  flattenRichMarkdown,
  structuredPlainToRichMarkdown,
} from '../richText'

describe('richText — préservation du gras', () => {
  it('texte sans gras : inchangé byte-pour-byte partout', () => {
    const s = 'Le ventilateur diffuse un flux d’air uniforme.'
    expect(stripBoldMarkers(s)).toBe(s)
    expect(normalizeBoldMarkers(s)).toBe(s)
    expect(boldMarkdownToHtml(s)).toBe(s)
    expect(parseBoldRuns(s)).toEqual([{ text: s, bold: false }])
    expect(hasBoldMarkers(s)).toBe(false)
  })

  it('htmlBoldToMarkers convertit strong/b (casse + espaces tolérés)', () => {
    expect(htmlBoldToMarkers('a <strong>b</strong> c')).toBe('a **b** c')
    expect(htmlBoldToMarkers('a <B>b</B> c')).toBe('a **b** c')
    expect(htmlBoldToMarkers('a < b >b</ b > c')).toBe('a **b** c')
  })

  it('parseBoldRuns découpe en runs', () => {
    expect(parseBoldRuns('Marque : **Lifetime Air**')).toEqual([
      { text: 'Marque : ', bold: false },
      { text: 'Lifetime Air', bold: true },
    ])
    expect(parseBoldRuns('**Tout gras**')).toEqual([{ text: 'Tout gras', bold: true }])
    expect(parseBoldRuns('a **b** c **d**')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c ', bold: false },
      { text: 'd', bold: true },
    ])
  })

  it('marqueur orphelin : neutralisé, pas de gras parasite en fin', () => {
    expect(normalizeBoldMarkers('a **b c')).toBe('a b c')
    expect(parseBoldRuns('a **b c')).toEqual([{ text: 'a b c', bold: false }])
  })

  it('paires vides supprimées', () => {
    expect(normalizeBoldMarkers('a ****b')).toBe('a  b')
  })

  it('boldMarkdownToHtml échappe le HTML puis pose <strong>', () => {
    expect(boldMarkdownToHtml('a **b** c')).toBe('a <strong>b</strong> c')
    expect(boldMarkdownToHtml('**<script>** & x')).toBe('<strong>&lt;script&gt;</strong> &amp; x')
    expect(boldMarkdownToHtml('5 V < 10 V')).toBe('5 V &lt; 10 V')
  })

  it('htmlBoldToMarkers + parseBoldRuns : source <strong> → runs gras', () => {
    expect(parseBoldRuns(htmlBoldToMarkers('Poids : <strong>18 kg</strong>'))).toEqual([
      { text: 'Poids : ', bold: false },
      { text: '18 kg', bold: true },
    ])
  })
})

describe('descriptionMarkdownToHtml — structure préservée', () => {
  it('titres, gras, listes, paragraphes', () => {
    const md = [
      '## Le ventilateur sans hélice',
      '',
      'Un flux d’air **uniforme** et silencieux.',
      '',
      '## Caractéristiques principales :',
      '',
      '- Marque : Lifetime Air',
      '- Couleur : Noir',
    ].join('\n')
    expect(descriptionMarkdownToHtml(md)).toBe(
      '<h4>Le ventilateur sans hélice</h4>' +
      '<p>Un flux d’air <strong>uniforme</strong> et silencieux.</p>' +
      '<h4>Caractéristiques principales :</h4>' +
      '<ul><li>Marque : Lifetime Air</li><li>Couleur : Noir</li></ul>',
    )
  })

  it('niveaux de titre : # → h3, ### → h5', () => {
    expect(descriptionMarkdownToHtml('# Titre')).toBe('<h3>Titre</h3>')
    expect(descriptionMarkdownToHtml('### Sous-titre')).toBe('<h5>Sous-titre</h5>')
  })

  it('texte plat : un <p> par bloc, HTML échappé', () => {
    expect(descriptionMarkdownToHtml('Ligne A\n\nLigne B < C')).toBe('<p>Ligne A</p><p>Ligne B &lt; C</p>')
  })
})

describe('flattenRichMarkdown — teaser inline gras conservé', () => {
  it('retire titres et puces, garde le gras', () => {
    const md = '## Titre\n\nUn texte **fort**.\n\n- Puce 1\n- Puce 2'
    expect(flattenRichMarkdown(md)).toBe('Titre Un texte **fort**. Puce 1 Puce 2')
  })
})

describe('structuredPlainToRichMarkdown — JSON-LD Product.description → structuré', () => {
  it('paragraphes, sous-titre « : », liste tabulée → puces', () => {
    const jsonld = 'Le ventilateur allie design moderne, sécurité et performance silencieuse.\n\nGrâce à sa conception sans pales, il diffuse un flux d’air uniforme.\n\nCaractéristiques principales :\n\n\n\tMarque : Lifetime Air\n\tCouleur : Noir\n\tPuissance : 5 W'
    expect(structuredPlainToRichMarkdown(jsonld)).toBe(
      '# Le ventilateur allie design moderne, sécurité et performance silencieuse.\n\n' +
      'Grâce à sa conception sans pales, il diffuse un flux d’air uniforme.\n\n' +
      '## Caractéristiques principales :\n\n' +
      '- Marque : Lifetime Air\n- Couleur : Noir\n- Puissance : 5 W',
    )
  })

  it('un 1er paragraphe long reste de la prose (pas un titre)', () => {
    const long = 'a'.repeat(200) + '.\n\nSuite.'
    expect(structuredPlainToRichMarkdown(long).startsWith('# ')).toBe(false)
  })
})
