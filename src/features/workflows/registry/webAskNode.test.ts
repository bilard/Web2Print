import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/ai/llmRouter', () => ({ generateJson: vi.fn() }))
vi.mock('@/features/scraping/webContext', () => ({ gatherWebContext: vi.fn() }))

import { generateJson } from '@/features/ai/llmRouter'
import { gatherWebContext } from '@/features/scraping/webContext'
import { webAskNode } from './webAskNode'

const ctx = (): any => ({ signal: new AbortController().signal, log: vi.fn(), setProgress: vi.fn() })
type AnyOpts = any

describe('webAskNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateJson).mockResolvedValue({ answer: 'Réponse synthétisée.' } as never)
    vi.mocked(gatherWebContext).mockResolvedValue({
      text: '### Page\nDjokovic 6-4',
      sources: ['https://a/1'],
      results: [{ url: 'https://a/1', title: 'A', description: 'd' }],
    })
  })

  it('recherche puis synthétise une réponse LLM ancrée sur le contexte web', async () => {
    const out = await webAskNode.run(ctx(), { question: 'score ?', maxResults: 5, readPages: 2 }, {})

    expect(gatherWebContext).toHaveBeenCalledWith({ searchQuery: 'score ?', maxResults: 5, readPages: 2 })
    const opts = vi.mocked(generateJson).mock.calls[0][0] as AnyOpts
    expect(opts.task).toBe('web.answer')
    expect(opts.prompt).toContain('CONTEXTE WEB')
    expect(opts.prompt).toContain('Djokovic 6-4')
    expect(out.text).toBe('Réponse synthétisée.')
    expect(out.sheet.name).toBe('Sources')
    expect(out.sheet.rows).toHaveLength(1)
  })

  it("l'entrée amont `question` surcharge la config", async () => {
    await webAskNode.run(ctx(), { question: 'config', maxResults: 5, readPages: 2 }, { question: '  amont  ' })

    expect(gatherWebContext).toHaveBeenCalledWith(expect.objectContaining({ searchQuery: 'amont' }))
  })

  it('répond quand même (avec note) si aucun résultat web', async () => {
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '', sources: [], results: [] })

    const out = await webAskNode.run(ctx(), { question: 'q', maxResults: 5, readPages: 2 }, {})

    const opts = vi.mocked(generateJson).mock.calls[0][0] as AnyOpts
    expect(opts.prompt).toContain('aucun contenu web récupéré')
    expect(out.text).toBe('Réponse synthétisée.')
    expect(out.sheet.rows).toHaveLength(0)
  })

  it('jette si la question est vide (ni config ni entrée)', async () => {
    await expect(
      webAskNode.run(ctx(), { question: '   ', maxResults: 5, readPages: 2 }, {}),
    ).rejects.toThrow(/Question manquante/)
  })
})
