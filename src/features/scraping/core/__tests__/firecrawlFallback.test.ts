import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { firecrawlScrape } from '../firecrawlFallback'

const realFetch = global.fetch

describe('firecrawlScrape', () => {
  beforeEach(() => { global.fetch = vi.fn() as unknown as typeof fetch })
  afterEach(() => { global.fetch = realFetch })

  it('retourne le markdown si succès', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { markdown: '# Hello\n\nProduit XYZ' } }),
    })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result?.markdown).toBe('# Hello\n\nProduit XYZ')
  })

  it('retourne null si pas de clé', async () => {
    const result = await firecrawlScrape('https://example.com/p', '')
    expect(result).toBeNull()
  })

  it('retourne null si réponse non-ok', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result).toBeNull()
  })

  it('retourne null si fetch throw', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'))
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result).toBeNull()
  })

  it('extrait advantages/specs/description si présent dans `extract`', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          markdown: '# x',
          extract: {
            description: 'Une description',
            advantages: ['avantage 1', 'avantage 2'],
            specs: [{ name: 'Poids', value: '1kg' }],
          },
        },
      }),
    })
    const result = await firecrawlScrape('https://example.com/p', 'fc-test-key')
    expect(result?.extract?.description).toBe('Une description')
    expect(result?.extract?.advantages).toEqual(['avantage 1', 'avantage 2'])
  })
})
