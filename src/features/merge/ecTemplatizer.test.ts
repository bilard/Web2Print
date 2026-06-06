import { describe, it, expect } from 'vitest'
import { templatizeEcStory } from './ecTemplatizer'

const STORY = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging">` +
  `<Story Self="s1"><ParagraphStyleRange>${inner}</ParagraphStyleRange></Story></idPkg:Story>`

const MARK_OPEN = '<CharacterStyleRange ECTagData="$ID/4 Prix"><Content>﻿</Content></CharacterStyleRange>'
const MARK_CLOSE = '<CharacterStyleRange ECTagData="$ID/5 Prix"><Content>﻿</Content></CharacterStyleRange>'

describe('templatizeEcStory', () => {
  it('réinjecte {{champ}} dans le run de valeur et conserve les marqueurs', () => {
    const xml = STORY(`${MARK_OPEN}<CharacterStyleRange><Content>12,99</Content></CharacterStyleRange>${MARK_CLOSE}`)
    const out = templatizeEcStory(xml)
    expect(out).toContain('{{Prix}}')
    expect(out).not.toContain('12,99')
    expect(out).toContain('ECTagData="$ID/4 Prix"')
    expect(out).toContain('ECTagData="$ID/5 Prix"')
  })

  it('laisse une story sans ECTagData strictement inchangée', () => {
    const xml = STORY('<CharacterStyleRange><Content>Texte normal</Content></CharacterStyleRange>')
    expect(templatizeEcStory(xml)).toBe(xml)
  })

  it('avec une valeur sur plusieurs runs, place {{champ}} une seule fois et vide le reste', () => {
    const xml = STORY(
      `${MARK_OPEN}` +
      `<CharacterStyleRange><Content>12</Content></CharacterStyleRange>` +
      `<CharacterStyleRange><Content>,99</Content></CharacterStyleRange>` +
      `${MARK_CLOSE}`,
    )
    const out = templatizeEcStory(xml)
    expect((out.match(/\{\{Prix\}\}/g) ?? []).length).toBe(1)
    expect(out).not.toContain('12')
    expect(out).not.toContain(',99')
  })

  it('conserve le prologue <?xml … ?> (XMLSerializer l’omet, IDML l’exige)', () => {
    const xml = STORY(`${MARK_OPEN}<CharacterStyleRange><Content>12,99</Content></CharacterStyleRange>${MARK_CLOSE}`)
    const out = templatizeEcStory(xml)
    expect(out.startsWith('<?xml')).toBe(true)
  })
})
