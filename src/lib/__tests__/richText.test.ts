import { describe, it, expect } from 'vitest'
import {
  htmlBoldToMarkers,
  stripBoldMarkers,
  hasBoldMarkers,
  normalizeBoldMarkers,
  parseBoldRuns,
  boldMarkdownToHtml,
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
