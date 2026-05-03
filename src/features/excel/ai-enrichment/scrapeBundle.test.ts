import { describe, it, expect, vi } from 'vitest'
import { scrapeProductBundle, extractPrimarySourceSection } from './scrapeBundle'

describe('scrapeProductBundle', () => {
  it('returns primary-only when no related URLs found', async () => {
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Primary content', html: '<html><body><p>x</p></body></html>' })
    const fastScrape = vi.fn()
    const bundle = await scrapeProductBundle('https://example.com/product', { deepScrape, fastScrape })
    expect(bundle.sourcesScrapped).toEqual(['https://example.com/product'])
    expect(bundle.mergedMarkdown).toContain('# Primary content')
    expect(fastScrape).not.toHaveBeenCalled()
  })

  it('scrapes discovered tabs in parallel and merges', async () => {
    const html = `
      <html><body>
        <main><div role="tablist">
          <a href="/p?tab=a">A</a>
          <a href="/p?tab=b">B</a>
        </div></main>
      </body></html>`
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Main', html })
    const fastScrape = vi.fn()
      .mockResolvedValueOnce('## Tab A content that is long enough to pass the length gate — lorem ipsum filler to reach over one hundred characters safely')
      .mockResolvedValueOnce('## Tab B content that is long enough to pass the length gate — lorem ipsum filler to reach over one hundred characters safely')
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.sourcesScrapped).toHaveLength(3)
    expect(bundle.mergedMarkdown).toContain('Tab A content')
    expect(bundle.mergedMarkdown).toContain('Tab B content')
  })

  it('handles partial failures gracefully (Promise.allSettled)', async () => {
    const html = `<html><body><main><div role="tablist"><a href="/p?tab=a">A</a><a href="/p?tab=b">B</a></div></main></body></html>`
    const deepScrape = vi.fn().mockResolvedValue({ markdown: '# Main', html })
    const fastScrape = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('## Tab B content long enough to pass the gate — lorem ipsum filler to reach over one hundred characters safely and comfortably')
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.errors).toHaveLength(1)
    expect(bundle.errors[0].error).toContain('timeout')
    expect(bundle.mergedMarkdown).toContain('Tab B content')
  })

  it('returns empty bundle when deepScrape fails', async () => {
    const deepScrape = vi.fn().mockResolvedValue(null)
    const fastScrape = vi.fn()
    const bundle = await scrapeProductBundle('https://example.com/p', { deepScrape, fastScrape })
    expect(bundle.errors[0].error).toBe('Deep scrape returned null')
    expect(bundle.mergedMarkdown).toBe('')
  })
})

describe('extractPrimarySourceSection', () => {
  it('retourne le markdown tel quel si aucun marqueur [Source:]', () => {
    const md = '# Produit\n\nDescription du produit.'
    expect(extractPrimarySourceSection(md)).toBe(md)
  })

  it('retourne uniquement la 1re section quand plusieurs sources fusionnées', () => {
    const md = [
      '## [Source: https://example.com/product]',
      '# Aspirateur Dyson',
      'Description produit principale.',
      '',
      '## [Source: https://example.com/product/avis?productCode=123]',
      'Sélectionnez une ligne ci-dessous pour filtrer les avis.',
      'Révèle les taches grâce à un faisceau lumineux.',
      '',
      '## [Source: https://example.com/doc.pdf]',
      'Fiche technique PDF.',
    ].join('\n')

    const primary = extractPrimarySourceSection(md)
    expect(primary).toContain('Description produit principale')
    expect(primary).not.toContain('filtrer les avis')
    expect(primary).not.toContain('Fiche technique PDF')
  })

  it('retourne tout si un seul marqueur [Source:]', () => {
    const md = '## [Source: https://example.com/product]\n# Produit\nDescription.'
    const result = extractPrimarySourceSection(md)
    expect(result).toContain('Description')
  })
})
