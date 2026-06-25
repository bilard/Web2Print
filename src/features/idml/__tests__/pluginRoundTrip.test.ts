// src/features/idml/__tests__/pluginRoundTrip.test.ts
import { describe, it, expect } from 'vitest'
import { flattenXmlElementStory, extractStoryFields } from '@/features/idml/xmlElementStory'

// Story XML minimal tel que produit par InDesign après balisage par le plugin.
const STORY = `<Story>
  <XMLElement MarkupTag="XMLTag/Reference">
    <ParagraphStyleRange><CharacterStyleRange><Content>A-1</Content></CharacterStyleRange></ParagraphStyleRange>
  </XMLElement>
</Story>`

describe('round-trip plugin → import Web2Print', () => {
  it('un tag XML natif est détecté comme champ', () => {
    expect(extractStoryFields(STORY)).toContain('Reference')
  })
  it('flatten produit le placeholder {{Reference}}', () => {
    expect(flattenXmlElementStory(STORY)).toContain('{{Reference}}')
  })
})
