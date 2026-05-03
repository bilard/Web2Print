import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractStructuredDataFromUrl } from '../structuredDataFetcher'

const realFetch = global.fetch

describe('extractStructuredDataFromUrl', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('utilise allorigins, retourne data si Product trouvé', async () => {
    const html = '<html><head><script type="application/ld+json">{"@type":"Product","name":"X","description":"d"}</script></head></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })
    const data = await extractStructuredDataFromUrl('https://example.com/p/x')
    expect(data?.name).toBe('X')
    expect(data?.description).toBe('d')
  })

  it('fallback sur corsproxy.io si allorigins échoue', async () => {
    const html = '<html><head><script type="application/ld+json">{"@type":"Product","name":"Y"}</script></head></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('allorigins down'))
      .mockResolvedValueOnce({ ok: true, text: async () => html })
    const data = await extractStructuredDataFromUrl('https://example.com/p/y')
    expect(data?.name).toBe('Y')
  })

  it('retourne null si tous les proxies échouent', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('p1'))
      .mockRejectedValueOnce(new Error('p2'))
      .mockRejectedValueOnce(new Error('p3'))
    const data = await extractStructuredDataFromUrl('https://example.com/x')
    expect(data).toBeNull()
  })

  it('retourne null si HTML sans Product', async () => {
    const html = '<html><body>Hello</body></html>'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => html,
    })
    const data = await extractStructuredDataFromUrl('https://example.com/x')
    expect(data).toBeNull()
  })

  it('respecte le timeout (court par tentative)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise(() => {})) // never resolves
    const start = Date.now()
    const data = await extractStructuredDataFromUrl('https://example.com/slow', { timeoutMs: 100 })
    const elapsed = Date.now() - start
    expect(data).toBeNull()
    // Le timeout par tentative est 100ms ; il y a 2 proxies + 1 Jina fallback,
    // donc on reste sous 1s en pratique avec mocks rejectés rapidement par AbortController.
    expect(elapsed).toBeLessThan(2000)
  })
})
