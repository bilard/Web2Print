import { describe, it, expect, beforeEach } from 'vitest'
import { useDesignBriefStore, useDesignBrief } from './designBrief.store'
import { DEFAULT_DESIGN_BRIEF, type DesignBriefState } from '@/features/ai-design/types'

describe('designBrief.store', () => {
  beforeEach(() => {
    useDesignBriefStore.getState().resetBrief()
  })

  it('starts with brief === null', () => {
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('useDesignBrief selector returns DEFAULTS when brief === null', () => {
    const brief = useDesignBriefStore.getState().brief
    const effective = brief ?? DEFAULT_DESIGN_BRIEF
    expect(effective).toEqual(DEFAULT_DESIGN_BRIEF)
  })

  it('setBrief creates a full state from DEFAULTS when brief === null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'hello' })
    const brief = useDesignBriefStore.getState().brief
    expect(brief).not.toBeNull()
    expect(brief!.prompt).toBe('hello')
    expect(brief!.style).toBe(DEFAULT_DESIGN_BRIEF.style)
    expect(brief!.updatedAt).toBeGreaterThan(0)
  })

  it('setBrief applies partial patches without overwriting other fields', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'first' })
    useDesignBriefStore.getState().setBrief({ style: 'bold' })
    const brief = useDesignBriefStore.getState().brief!
    expect(brief.prompt).toBe('first')
    expect(brief.style).toBe('bold')
  })

  it('setBrief updates updatedAt on every call', async () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'a' })
    const first = useDesignBriefStore.getState().brief!.updatedAt
    await new Promise((r) => setTimeout(r, 2))
    useDesignBriefStore.getState().setBrief({ prompt: 'b' })
    const second = useDesignBriefStore.getState().brief!.updatedAt
    expect(second).toBeGreaterThan(first)
  })

  it('resetBrief sets brief back to null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'x' })
    useDesignBriefStore.getState().resetBrief()
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('hydrateBrief(null) sets brief to null', () => {
    useDesignBriefStore.getState().setBrief({ prompt: 'x' })
    useDesignBriefStore.getState().hydrateBrief(null)
    expect(useDesignBriefStore.getState().brief).toBeNull()
  })

  it('hydrateBrief(obj) replaces brief entirely', () => {
    const incoming: DesignBriefState = {
      prompt: 'loaded',
      formatId: 'a4',
      customWidthMm: undefined,
      customHeightMm: undefined,
      style: 'elegant',
      includeBleed: false,
      paletteText: '#ff0000',
      updatedAt: 1234,
    }
    useDesignBriefStore.getState().hydrateBrief(incoming)
    expect(useDesignBriefStore.getState().brief).toEqual(incoming)
  })

  it('useDesignBrief is exported and is a function', () => {
    expect(typeof useDesignBrief).toBe('function')
  })
})
