import { describe, it, expect } from 'vitest'
import { templatizeXmlElementStory } from './xmlElementStory'
import { resolveText } from '@/features/merge/mergeEngine'
import type { MergeRow } from '@/stores/merge.store'

const STORY = `<?xml version="1.0"?><idPkg:Story xmlns:idPkg="x"><Story Self="s1">` +
  `<ParagraphStyleRange><XMLElement MarkupTag="XMLTag/Prix">` +
  `<CharacterStyleRange><Content>22</Content></CharacterStyleRange>` +
  `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
  `</XMLElement></ParagraphStyleRange></Story></idPkg:Story>`

describe('round-trip export XML natif', () => {
  it('templatise en {{Prix}} puis résout la valeur de la ligne, en conservant la balise', () => {
    const templ = templatizeXmlElementStory(STORY)
    expect(templ).toContain('{{Prix}}')
    expect(templ).toContain('MarkupTag="XMLTag/Prix"')

    // Simule patchStories : remplacer {{}} dans <Content> via resolveText
    const row: MergeRow = { _id: 'r1', Prix: '49,90' }
    const out = templ.replace(
      /(<Content>)([\s\S]*?)(<\/Content>)/g,
      (m, open, content, close) =>
        content.includes('{{') ? `${open}${resolveText(content, row)}${close}` : m,
    )
    expect(out).toContain('49,90')
    expect(out).toContain('MarkupTag="XMLTag/Prix"') // round-trip : balise préservée
    expect(out).not.toContain('{{Prix}}')
  })
})
