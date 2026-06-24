import { describe, it, expect } from 'vitest'
import { parseIdml } from './idmlParser'

// Rectangle image u1ca contenant <Image Self="u1c4"> ; BackingStory balise u1c4 = Image.
const SPREAD = `<?xml version="1.0"?><idPkg:Spread xmlns:idPkg="x">
<Spread Self="sp1"><Page Self="pg1" GeometricBounds="0 0 200 200" ItemTransform="1 0 0 1 0 0" />
<Rectangle Self="u1ca" ContentType="GraphicType" ItemTransform="1 0 0 1 10 10">
<Properties><PathGeometry><GeometryPathType><PathPointArray>
<PathPointType Anchor="0 0"/><PathPointType Anchor="50 0"/>
<PathPointType Anchor="50 50"/><PathPointType Anchor="0 50"/>
</PathPointArray></GeometryPathType></PathGeometry></Properties>
<Image Self="u1c4" ItemTransform="1 0 0 1 0 0"><Properties><GraphicBounds Left="0" Top="0" Right="50" Bottom="50"/></Properties></Image>
</Rectangle></Spread></idPkg:Spread>`

const BACKING = `<?xml version="1.0"?><idPkg:BackingStory xmlns:idPkg="x">
<XmlStory Self="u98"><ParagraphStyleRange><CharacterStyleRange>
<XMLElement Self="di3" MarkupTag="XMLTag/Root">
<XMLElement Self="di3i7" MarkupTag="XMLTag/Image" XMLContent="u1c4">
<XMLAttribute Name="href" Value="file:///x.png" /></XMLElement>
</XMLElement></CharacterStyleRange></ParagraphStyleRange></XmlStory></idPkg:BackingStory>`

describe('parseIdml — image balisée via BackingStory', () => {
  it('pose ecImageField sur le cadre image dont l\'Image enfant est référencée', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, {}, {}, '', {}, BACKING)
    const rect = doc.objects.find((o) => o.type === 'Rectangle' || o.type === 'Image')
    expect(rect?.ecImageField).toBe('Image')
  })
  it('expose l\'arbre des balises', () => {
    const doc = parseIdml({ 'Spreads/s.xml': SPREAD }, {}, {}, '', {}, BACKING)
    expect(doc.tagTree?.field).toBe('Root')
  })
})
