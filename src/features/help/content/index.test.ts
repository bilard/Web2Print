import { describe, it, expect } from 'vitest'
import { helpSections, helpSectionsById } from './index'
import { HIGHLIGHT_IDS } from '../hooks/highlightIds'
import { MODULE_ITEMS } from '@/features/navigation/modules'

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

  // Le bloc dynamique `module-links` (cf. getting-started) génère un highlightId
  // `dashboard.sidebar.<id>` par module : ils doivent tous être dans la whitelist,
  // sinon le clic ne met rien en évidence à l'écran.
  it('every module has a whitelisted sidebar highlightId', () => {
    const whitelist = new Set<string>(HIGHLIGHT_IDS)
    const offenders = MODULE_ITEMS.map((m) => `dashboard.sidebar.${m.id}`).filter(
      (id) => !whitelist.has(id),
    )
    expect(offenders).toEqual([])
  })
})
