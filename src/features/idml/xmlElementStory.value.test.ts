import { describe, it, expect } from 'vitest'
import { valueXmlElementStory, extractStoryFields, templatizeXmlElementStory } from './xmlElementStory'

const STORY = (inner: string) =>
  `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="s1">${inner}</Story></idPkg:Story>`

const PRIX = `<ParagraphStyleRange><XMLElement MarkupTag="XMLTag/Prix_normal">` +
  `<CharacterStyleRange><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>€</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange>`

describe('valueXmlElementStory', () => {
  it('unwraps XMLElement while preserving original content (no {{}})', () => {
    const out = valueXmlElementStory(STORY(PRIX))
    expect(out).toContain('22')
    expect(out).toContain(',99')
    expect(out).not.toContain('{{')
    expect(out).not.toContain('<XMLElement')
  })
  it('leaves unmarked story unchanged', () => {
    const plain = STORY('<ParagraphStyleRange><CharacterStyleRange><Content>OFFRE</Content></CharacterStyleRange></ParagraphStyleRange>')
    expect(valueXmlElementStory(plain)).toBe(plain)
  })
})

describe('extractStoryFields', () => {
  it('lists leaf field tags deduplicated in order', () => {
    const inner = `<XMLElement MarkupTag="XMLTag/Article"><ParagraphStyleRange>` +
      `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Libelle_Article"><Content>L</Content></XMLElement></CharacterStyleRange>` +
      `<CharacterStyleRange><XMLElement MarkupTag="XMLTag/Marques"><Content>M</Content></XMLElement></CharacterStyleRange>` +
      `</ParagraphStyleRange></XMLElement>`
    expect(extractStoryFields(STORY(inner))).toEqual(['Libelle_Article', 'Marques'])
  })
  it('unmarked story returns empty array', () => {
    expect(extractStoryFields(STORY('<ParagraphStyleRange><CharacterStyleRange><Content>x</Content></CharacterStyleRange></ParagraphStyleRange>'))).toEqual([])
  })
})
