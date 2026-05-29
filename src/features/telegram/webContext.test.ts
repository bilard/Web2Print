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

  it('lit les URLs du message (option B)', async () => {
    read.mockResolvedValue(page('contenu page', 'Titre A'))

    const ctx = await gatherWebContext({ urls: ['https://exemple.com/a'] })

    expect(read).toHaveBeenCalledWith('https://exemple.com/a', { noCache: true })
    expect(ctx.text).toContain('contenu page')
    expect(ctx.sources).toEqual(['https://exemple.com/a'])
  })

  it('recherche + LIT réellement les premières pages de résultats (donnée live)', async () => {
    search.mockResolvedValue([
      { url: 'https://live.example/1', title: 'Live 1', description: 'suivez en direct' },
      { url: 'https://live.example/2', title: 'Live 2' },
      { url: 'https://live.example/3', title: 'Live 3' },
    ])
    read.mockImplementation(async (u: string) => page(`SCORE depuis ${u}`))

    const ctx = await gatherWebContext({ searchQuery: 'score Fonseca Djokovic' })

    // snippets listés + lecture réelle des 2 premiers (MAX_READ_RESULTS)
    expect(ctx.text).toContain('Résultats de recherche web')
    expect(read).toHaveBeenCalledTimes(2)
    expect(ctx.text).toContain('SCORE depuis https://live.example/1')
    expect(ctx.text).toContain('SCORE depuis https://live.example/2')
    expect(ctx.sources).toEqual([
      'https://live.example/1',
      'https://live.example/2',
      'https://live.example/3',
    ])
  })

  it('ne relit pas une URL déjà lue depuis le message', async () => {
    search.mockResolvedValue([{ url: 'https://exemple.com/a', title: 'A' }])
    read.mockResolvedValue(page('contenu'))

    await gatherWebContext({ urls: ['https://exemple.com/a'], searchQuery: 'a' })

    // 1 lecture pour l'URL du message, 0 relecture via les résultats
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('panne Jina avalée → contexte vide, jamais d’exception', async () => {
    search.mockRejectedValue(new Error('jina down'))
    read.mockRejectedValue(new Error('jina down'))

    const ctx = await gatherWebContext({ urls: ['https://x.com'], searchQuery: 'q' })

    expect(ctx).toEqual({ text: '', sources: [] })
  })
})
