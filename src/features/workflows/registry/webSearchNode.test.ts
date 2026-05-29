import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/scraping/webContext', () => ({ gatherWebContext: vi.fn() }))

import { gatherWebContext } from '@/features/scraping/webContext'
import { webSearchNode } from './webSearchNode'

const ctx = (): any => ({ signal: new AbortController().signal, log: vi.fn(), setProgress: vi.fn() })

describe('webSearchNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gatherWebContext).mockResolvedValue({
      text: '### Résultats…',
      sources: ['https://a/1', 'https://a/2'],
      results: [
        { url: 'https://a/1', title: 'A', description: 'da' },
        { url: 'https://a/2', title: 'B' },
      ],
    })
  })

  it('recherche et produit un sheet (titre/url/description) + le texte de synthèse', async () => {
    const out = await webSearchNode.run(ctx(), { query: 'roland garros', maxResults: 5, readPages: 2 }, {})

    expect(gatherWebContext).toHaveBeenCalledWith({ searchQuery: 'roland garros', maxResults: 5, readPages: 2 })
    expect(out.text).toBe('### Résultats…')
    expect(out.sheet.name).toBe('Recherche web')
    expect(out.sheet.rows).toHaveLength(2)
    expect(out.sheet.rows[0]).toMatchObject({ title: 'A', url: 'https://a/1', description: 'da' })
    expect(out.sheet.columns.map((c) => c.key)).toEqual(['title', 'url', 'description'])
  })

  it("l'entrée amont `query` surcharge la config", async () => {
    await webSearchNode.run(ctx(), { query: 'config', maxResults: 5, readPages: 2 }, { query: '  amont  ' })

    expect(gatherWebContext).toHaveBeenCalledWith(expect.objectContaining({ searchQuery: 'amont' }))
  })

  it('jette si la requête est vide', async () => {
    await expect(
      webSearchNode.run(ctx(), { query: '  ', maxResults: 5, readPages: 2 }, {}),
    ).rejects.toThrow(/Requête manquante/)
  })
})
