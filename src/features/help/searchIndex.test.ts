import { describe, it, expect, beforeEach } from 'vitest'
import { suggestWords, searchSections, __resetIndexForTests } from './searchIndex'

describe('help search index', () => {
  beforeEach(() => __resetIndexForTests())

  it('autocomplete prefix match: "expor" → contient export/exporter', () => {
    const words = suggestWords('expor', 10)
    expect(words.length).toBeGreaterThan(0)
    expect(words.some((w) => w.startsWith('expor'))).toBe(true)
  })

  it('autocomplete handles common app term: "zoom"', () => {
    const words = suggestWords('zoo', 10)
    expect(words).toContain('zoom')
  })

  it('returns empty for blank query', () => {
    expect(suggestWords('', 10)).toEqual([])
    expect(suggestWords('   ', 10)).toEqual([])
  })

  it('strips stopwords from vocabulary', () => {
    expect(suggestWords('le', 10)).not.toContain('le')
    expect(suggestWords('un', 10)).not.toContain('un')
  })

  it('searchSections returns section hits for "scraping"', () => {
    const hits = searchSections('scraping', 20)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.sectionId === 'scraping')).toBe(true)
    for (const h of hits) {
      expect(h.snippet.toLowerCase()).toContain('scraping')
    }
  })

  it('snippet match offsets point to the search term', () => {
    const [hit] = searchSections('export', 1)
    expect(hit).toBeDefined()
    const matched = hit.snippet.slice(hit.matchStart, hit.matchEnd)
    expect(matched.toLowerCase()).toBe('export')
  })

  it('caps results at max', () => {
    expect(searchSections('e', 3).length).toBeLessThanOrEqual(3)
  })
})
