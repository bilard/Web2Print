import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x"><Spread Self="sp1">
<Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<TextFrame Self="tf1" ParentStory="u16c" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="100 0"/>
<PathPointType Anchor="100 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
</TextFrame></Spread></idPkg:Spread>`

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="u16c">
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/n">
<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n">
<XMLElement MarkupTag="XMLTag/Prix_normal"><Content>22,99</Content></XMLElement>
</CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`

describe('parseIdml — valeurs d’origine', () => {
  it('texte = valeur d’origine (pas {{}}), mergeTemplate = {{Prix_normal}}, mergeFields listés', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, { 'Stories/u16c.xml': STORY }, {}, '')
    const tf = doc.objects.find((o) => o.type === 'TextFrame')
    const text = (tf?.paragraphs ?? []).map((p) => p.text).join('')
    expect(text).toContain('22,99')
    expect(text).not.toContain('{{')
    expect(tf?.mergeTemplate).toContain('{{Prix_normal}}')
    expect(tf?.mergeFields).toEqual(['Prix_normal'])
  })
})
