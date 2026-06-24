// src/features/idml/idmlParser.xmltags.test.ts
import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x">
<Spread Self="sp1"><Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<TextFrame Self="tf1" ParentStory="u156" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="100 0"/>
<PathPointType Anchor="100 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
</TextFrame></Spread></idPkg:Spread>`

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x">
<Story Self="u156">
<XMLElement Self="a1" MarkupTag="XMLTag/Article" XMLContent="u156">
<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/n">
<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/n">
<XMLElement MarkupTag="XMLTag/Prix"><Content>22</Content></XMLElement>
</CharacterStyleRange></ParagraphStyleRange></XMLElement></Story></idPkg:Story>`

describe('parseIdml — stories balisées XML natif', () => {
  it('convertit un champ balisé en placeholder {{Prix}} dans le texte du paragraphe', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, { 'Stories/u156.xml': STORY }, {}, '')
    const tf = doc.objects.find((o) => o.type === 'TextFrame')
    expect(tf).toBeTruthy()
    const text = (tf?.paragraphs ?? []).map((p) => p.text).join('')
    expect(text).toContain('{{Prix}}')
    expect(text).not.toContain('22')
  })
})
