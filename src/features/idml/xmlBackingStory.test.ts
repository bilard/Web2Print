import { describe, it, expect } from 'vitest'
import { parseBackingStoryImageFields, parseBackingStoryTagTree } from './xmlBackingStory'

const BACKING = `<?xml version="1.0"?><idPkg:BackingStory xmlns:idPkg="x">
<XmlStory Self="u98"><ParagraphStyleRange><CharacterStyleRange>
<XMLElement Self="di3" MarkupTag="XMLTag/Root">
  <XMLElement Self="di3i4" MarkupTag="XMLTag/Article" XMLContent="u156" />
  <XMLElement Self="di3i5" MarkupTag="XMLTag/Prix" XMLContent="u16c" />
  <XMLElement Self="di3i7" MarkupTag="XMLTag/Image" XMLContent="u1c4">
    <XMLAttribute Self="a" Name="href" Value="file:///x.png" />
  </XMLElement>
</XMLElement>
</CharacterStyleRange></ParagraphStyleRange></XmlStory></idPkg:BackingStory>`

describe('parseBackingStoryImageFields', () => {
  it('mappe chaque XMLContent vers son nom de champ', () => {
    const map = parseBackingStoryImageFields(BACKING)
    expect(map.get('u1c4')).toBe('Image')
    expect(map.get('u156')).toBe('Article')
    expect(map.get('u16c')).toBe('Prix')
  })
  it('renvoie une map vide pour une entrée vide', () => {
    expect(parseBackingStoryImageFields('').size).toBe(0)
  })
})

describe('parseBackingStoryTagTree', () => {
  it('reconstruit la hiérarchie Root > [Article, Prix, Image]', () => {
    const tree = parseBackingStoryTagTree(BACKING)
    expect(tree?.field).toBe('Root')
    expect(tree?.children.map((c) => c.field)).toEqual(['Article', 'Prix', 'Image'])
    expect(tree?.children[0].objectId).toBe('u156')
  })
  it('renvoie null pour une entrée vide', () => {
    expect(parseBackingStoryTagTree('')).toBeNull()
  })
})
