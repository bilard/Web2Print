import { describe, it, expect } from 'vitest'
import type { IdmlZipContents } from '@/features/idml/assemblyLoader'
import { flattenXmlElementStory, templatizeXmlElementStory, templatizeXmlElementContents } from './xmlElementStory'

const STORY = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">` +
  `<Story Self="s1">${inner}</Story></idPkg:Story>`

// Prix éclaté en 4 runs, enveloppé d'un seul XMLElement Prix (cas réel run-splitting)
const PRIX = `<ParagraphStyleRange>` +
  `<XMLElement Self="x1" MarkupTag="XMLTag/Prix">` +
  `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n"><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>€</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange>`

// Prix avec override de police dans <Properties><AppliedFont> (enfant du CSR, pas attribut)
const PRIX_FONT = `<ParagraphStyleRange>` +
  `<XMLElement Self="x2" MarkupTag="XMLTag/Prix">` +
  `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n">` +
  `<Properties><AppliedFont type="object">SomeFont</AppliedFont></Properties>` +
  `<Content>22</Content>` +
  `</CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange>`

// Story sans XMLElement mais contenant la chaîne littérale "MarkupTag" dans du texte
const NO_XML_ELEMENT = `<ParagraphStyleRange>` +
  `<CharacterStyleRange><Content>le mot MarkupTag ici</Content></CharacterStyleRange>` +
  `</ParagraphStyleRange>`

// 3 feuilles dans un conteneur Article, sur 2 paragraphes
const MULTI = `<XMLElement Self="a1" MarkupTag="XMLTag/Article" XMLContent="s1">` +
  `<ParagraphStyleRange>` +
  `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Libelle_Article"><Content>Libelle Article</Content></XMLElement><Br /></CharacterStyleRange>` +
  `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Marques"><Content>Marques</Content></XMLElement></CharacterStyleRange>` +
  `</ParagraphStyleRange></XMLElement>`

describe('flattenXmlElementStory (import)', () => {
  it('réduit un champ éclaté en 4 runs à un seul {{Prix}} et supprime les XMLElement', () => {
    const out = flattenXmlElementStory(STORY(PRIX))
    expect((out.match(/\{\{Prix\}\}/g) ?? []).length).toBe(1)
    expect(out).not.toContain('<XMLElement')
    expect(out).not.toContain('22')
    expect(out).not.toContain(',99')
  })

  it('aplatit un conteneur Article en remontant ses paragraphes, avec un placeholder par feuille', () => {
    const out = flattenXmlElementStory(STORY(MULTI))
    expect(out).toContain('{{Libelle_Article}}')
    expect(out).toContain('{{Marques}}')
    expect(out).not.toContain('<XMLElement')
    // les ParagraphStyleRange sont redevenus enfants directs de <Story>
    expect(/<Story[^>]*>\s*<ParagraphStyleRange/.test(out)).toBe(true)
  })

  it('laisse une story sans MarkupTag strictement inchangée', () => {
    const plain = STORY('<ParagraphStyleRange><CharacterStyleRange><Content>OFFRE</Content></CharacterStyleRange></ParagraphStyleRange>')
    expect(flattenXmlElementStory(plain)).toBe(plain)
  })

  it('préserve <Properties><AppliedFont> (deep clone CSR) — fixing #1', () => {
    // Ce test DOIT échouer avec cloneNode(false) (shallow) et passer après le fix deep clone.
    const out = flattenXmlElementStory(STORY(PRIX_FONT))
    expect(out).toContain('{{Prix}}')
    expect(out).toContain('AppliedFont')
    expect(out).toContain('SomeFont')
    expect(out).not.toContain('>22<')
  })

  it('garde-XMLElement : story avec "MarkupTag" en texte mais sans <XMLElement> reste strictement inchangée — fixing #2', () => {
    const xml = STORY(NO_XML_ELEMENT)
    expect(flattenXmlElementStory(xml)).toBe(xml)
  })

  it('conserve le prologue <?xml ?>', () => {
    expect(flattenXmlElementStory(STORY(PRIX)).startsWith('<?xml')).toBe(true)
  })
})

describe('templatizeXmlElementStory (export, round-trip)', () => {
  it('injecte {{Prix}} mais conserve les <XMLElement> pour le round-trip', () => {
    const out = templatizeXmlElementStory(STORY(PRIX))
    expect(out).toContain('{{Prix}}')
    expect(out).toContain('MarkupTag="XMLTag/Prix"')
    expect(out).not.toContain('22')
  })

  it('préserve <Properties><AppliedFont> en mode export (unwrap=false) — fixing #1', () => {
    const out = templatizeXmlElementStory(STORY(PRIX_FONT))
    expect(out).toContain('{{Prix}}')
    expect(out).toContain('MarkupTag="XMLTag/Prix"')
    expect(out).toContain('AppliedFont')
    expect(out).toContain('SomeFont')
    expect(out).not.toContain('>22<')
  })
})

describe('templatizeXmlElementContents', () => {
  it('applique la templatisation à toutes les stories du zip', () => {
    const contents: IdmlZipContents = {
      spreads: {},
      resources: {},
      masterSpreads: {},
      designMap: '',
      stories: { 'Stories/Story_s1.xml': STORY(PRIX) },
    }
    const result = templatizeXmlElementContents(contents)
    const story = result.stories['Stories/Story_s1.xml']
    expect(story).toContain('{{Prix}}')
    expect(story).toContain('MarkupTag="XMLTag/Prix"')
    expect(story).not.toContain('22')
    // les autres champs sont inchangés
    expect(result.designMap).toBe('')
    expect(result.spreads).toEqual({})
  })
})
