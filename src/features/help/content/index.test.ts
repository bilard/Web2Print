import { describe, it, expect } from 'vitest'
import { helpSections, helpSectionsById } from './index'
import { HIGHLIGHT_IDS } from '../hooks/highlightIds'

describe('help content registry', () => {
  it('contains at least 8 sections (2 rédigées + 8 stubs)', () => {
    expect(helpSections.length).toBeGreaterThanOrEqual(8)
  })

  it('every section has a unique id', () => {
    const ids = helpSections.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('helpSectionsById resolves every section by id', () => {
    for (const s of helpSections) {
      expect(helpSectionsById.get(s.id)).toBe(s)
    }
  })

  it('every menu-link highlightId is in the whitelist', () => {
    const whitelist = new Set<string>(HIGHLIGHT_IDS)
    const offenders: string[] = []
    for (const s of helpSections) {
      for (const b of s.blocks) {
        if (b.type === 'menu-link' && b.target.highlightId) {
          if (!whitelist.has(b.target.highlightId)) {
            offenders.push(`${s.id}: ${b.target.highlightId}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
