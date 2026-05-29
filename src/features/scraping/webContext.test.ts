import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/scraping/useJina', () => ({ jinaRead: vi.fn() }))
vi.mock('@/features/excel/ai-enrichment/useProductEnrichment', () => ({ jinaSearch: vi.fn() }))

import { jinaRead } from '@/features/scraping/useJina'
import { jinaSearch } from '@/features/excel/ai-enrichment/useProductEnrichment'
import { extractUrls, gatherWebContext } from './webContext'

const read = vi.mocked(jinaRead)
const search = vi.mocked(jinaSearch)

const page = (content: string, title = '') => ({ url: 'x', title, description: '', content })

describe('extractUrls', () => {
  it('extrait, déduplique et nettoie la ponctuation finale', () => {
    expect(extractUrls('voir https://a.com/x. et https://a.com/x aussi (https://b.com/y)')).toEqual([
      'https://a.com/x',
      'https://b.com/y',
    ])
  })
  it('renvoie [] sans URL', () => {
    expect(extractUrls('aucun lien ici')).toEqual([])
  })
})

describe('gatherWebContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lit les URLs fournies', async () => {
    read.mockResolvedValue(page('contenu page', 'Titre A'))

    const ctx = await gatherWebContext({ urls: ['https://exemple.com/a'] })

    expect(read).toHaveBeenCalledWith('https://exemple.com/a', { noCache: true })
    expect(ctx.text).toContain('contenu page')
    expect(ctx.sources).toEqual(['https://exemple.com/a'])
    expect(ctx.results).toEqual([])
  })

  it('recherche + LIT réellement les premières pages + renvoie les résultats structurés', async () => {
    search.mockResolvedValue([
      { url: 'https://live.example/1', title: 'Live 1', description: 'suivez en direct' },
      { url: 'https://live.example/2', title: 'Live 2' },
      { url: 'https://live.example/3', title: 'Live 3' },
    ])
    read.mockImplementation(async (u: string) => page(`SCORE depuis ${u}`))

    const ctx = await gatherWebContext({ searchQuery: 'score Fonseca Djokovic' })

    expect(ctx.text).toContain('Résultats de recherche web')
    expect(read).toHaveBeenCalledTimes(2) // readPages défaut = 2
    expect(ctx.text).toContain('SCORE depuis https://live.example/1')
    expect(ctx.text).toContain('SCORE depuis https://live.example/2')
    expect(ctx.results).toHaveLength(3)
    expect(ctx.results[0]).toEqual({ url: 'https://live.example/1', title: 'Live 1', description: 'suivez en direct' })
    expect(ctx.sources).toEqual([
      'https://live.example/1',
      'https://live.example/2',
      'https://live.example/3',
    ])
  })

  it('respecte maxResults et readPages', async () => {
    search.mockResolvedValue([
      { url: 'https://a/1' }, { url: 'https://a/2' }, { url: 'https://a/3' },
    ])
    read.mockResolvedValue(page('x'))

    await gatherWebContext({ searchQuery: 'q', maxResults: 3, readPages: 1 })

    expect(search).toHaveBeenCalledWith('q', 3)
    expect(read).toHaveBeenCalledTimes(1) // readPages = 1
  })

  it('ne relit pas une URL déjà lue depuis les URLs fournies', async () => {
    search.mockResolvedValue([{ url: 'https://exemple.com/a', title: 'A' }])
    read.mockResolvedValue(page('contenu'))

    await gatherWebContext({ urls: ['https://exemple.com/a'], searchQuery: 'a' })

    expect(read).toHaveBeenCalledTimes(1) // 1 lecture (URL fournie), 0 relecture via résultats
  })

  it('panne Jina avalée → contexte vide, jamais d’exception', async () => {
    search.mockRejectedValue(new Error('jina down'))
    read.mockRejectedValue(new Error('jina down'))

    const ctx = await gatherWebContext({ urls: ['https://x.com'], searchQuery: 'q' })

    expect(ctx).toEqual({ text: '', sources: [], results: [] })
  })
})
