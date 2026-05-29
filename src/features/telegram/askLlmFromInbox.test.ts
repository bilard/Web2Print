import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/ai/llmRouter', () => ({
  generateJson: vi.fn(),
}))

// On garde extractUrls réel (logique pure) et on ne mocke que la récupération web.
vi.mock('@/features/scraping/webContext', async (importActual) => {
  const actual = await importActual<typeof import('@/features/scraping/webContext')>()
  return { ...actual, gatherWebContext: vi.fn() }
})

import { generateJson } from '@/features/ai/llmRouter'
import { gatherWebContext } from '@/features/scraping/webContext'
import { askLlm } from './askLlmFromInbox'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOpts = any

/** Réponse de PLAN par défaut (pas de recherche, réponse directe). */
function planResult(over: Partial<{ needsWeb: boolean; searchQuery: string; answer: string }> = {}) {
  return { needsWeb: false, searchQuery: '', answer: 'Bonjour !', ...over }
}

describe('askLlm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '', sources: [], results: [] })
  })

  it('réponse directe (needsWeb=false) : un seul appel, pas de recherche web', async () => {
    vi.mocked(generateJson).mockImplementation(async (opts: AnyOpts) => {
      opts.onProviderUsed?.({ provider: 'deepseek', model: 'deepseek-chat' })
      return planResult({ answer: 'Salut à toi !' }) as never
    })

    const res = await askLlm('Salut')

    expect(res).toEqual({ answer: 'Salut à toi !', provider: 'deepseek', model: 'deepseek-chat', sources: [] })
    expect(generateJson).toHaveBeenCalledTimes(1)
    expect(gatherWebContext).not.toHaveBeenCalled()
  })

  it('le premier appel cible telegram.chatPlan et injecte la question', async () => {
    vi.mocked(generateJson).mockResolvedValue(planResult() as never)

    await askLlm('Quelle heure est-il ?')

    const opts = vi.mocked(generateJson).mock.calls[0][0] as AnyOpts
    expect(opts.task).toBe('telegram.chatPlan')
    expect(opts.prompt).toContain('Quelle heure est-il ?')
    expect(opts.schemaForLLM.required).toEqual(expect.arrayContaining(['needsWeb', 'searchQuery', 'answer']))
  })

  it('needsWeb=true : lance la recherche puis répond avec le contexte web injecté', async () => {
    vi.mocked(generateJson)
      .mockImplementationOnce(async (opts: AnyOpts) => {
        opts.onProviderUsed?.({ provider: 'claude', model: 'claude-opus-4-8' })
        return planResult({ needsWeb: true, searchQuery: 'score Fonseca Djokovic', answer: '' }) as never
      })
      .mockImplementationOnce(async (opts: AnyOpts) => {
        opts.onProviderUsed?.({ provider: 'claude', model: 'claude-opus-4-8' })
        return { answer: 'Djokovic mène 6-4 3-2.' } as never
      })
    vi.mocked(gatherWebContext).mockResolvedValue({
      text: '### Résultats…\nDjokovic 6-4 3-2',
      sources: ['https://sport.example/match'],
      results: [],
    })

    const res = await askLlm('Le score Fonseca Djokovic ?')

    expect(gatherWebContext).toHaveBeenCalledWith({ urls: [], searchQuery: 'score Fonseca Djokovic' })
    expect(res.answer).toBe('Djokovic mène 6-4 3-2.')
    expect(res.sources).toEqual(['https://sport.example/match'])
    const answerOpts = vi.mocked(generateJson).mock.calls[1][0] as AnyOpts
    expect(answerOpts.task).toBe('telegram.chat')
    expect(answerOpts.prompt).toContain('CONTEXTE WEB')
    expect(answerOpts.prompt).toContain('Djokovic 6-4 3-2')
  })

  it('une URL dans le message déclenche la récupération même si needsWeb=false', async () => {
    vi.mocked(generateJson)
      .mockResolvedValueOnce(planResult({ needsWeb: false, answer: 'réponse directe' }) as never)
      .mockResolvedValueOnce({ answer: 'Résumé de la page.' } as never)
    vi.mocked(gatherWebContext).mockResolvedValue({
      text: '### Contenu…',
      sources: ['https://exemple.com/article'],
      results: [],
    })

    const res = await askLlm('Résume https://exemple.com/article stp')

    expect(gatherWebContext).toHaveBeenCalledWith({
      urls: ['https://exemple.com/article'],
      searchQuery: '',
    })
    expect(res.answer).toBe('Résumé de la page.')
    expect(res.sources).toEqual(['https://exemple.com/article'])
  })

  it('web vide + réponse directe du plan disponible → retombe sur la réponse du plan', async () => {
    vi.mocked(generateJson).mockResolvedValueOnce(
      planResult({ needsWeb: true, searchQuery: 'truc', answer: 'Je crois que…' }) as never,
    )
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '', sources: [], results: [] })

    const res = await askLlm('un truc')

    expect(res.answer).toBe('Je crois que…')
    expect(res.sources).toEqual([])
    expect(generateJson).toHaveBeenCalledTimes(1) // pas d'appel de réponse
  })

  it('web vide + plan sans réponse → appel de repli telegram.chat honnête', async () => {
    vi.mocked(generateJson)
      .mockResolvedValueOnce(planResult({ needsWeb: true, searchQuery: 'météo', answer: '' }) as never)
      .mockResolvedValueOnce({ answer: 'Je n’ai pas pu consulter de source à jour.' } as never)
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '', sources: [], results: [] })

    const res = await askLlm('météo demain ?')

    expect(res.answer).toBe('Je n’ai pas pu consulter de source à jour.')
    expect(res.sources).toEqual([])
    const fallbackOpts = vi.mocked(generateJson).mock.calls[1][0] as AnyOpts
    expect(fallbackOpts.task).toBe('telegram.chat')
  })

  it('le modèle renvoyé est celui du dernier appel (réponse contextualisée)', async () => {
    vi.mocked(generateJson)
      .mockImplementationOnce(async (opts: AnyOpts) => {
        opts.onProviderUsed?.({ provider: 'claude', model: 'claude-opus-4-8' })
        return planResult({ needsWeb: true, searchQuery: 'q', answer: '' }) as never
      })
      .mockImplementationOnce(async (opts: AnyOpts) => {
        opts.onProviderUsed?.({ provider: 'gemini', model: 'gemini-3.1-pro-preview' })
        return { answer: 'ok' } as never
      })
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '### r', sources: ['https://a'], results: [] })

    const res = await askLlm('question')

    expect(res.provider).toBe('gemini')
    expect(res.model).toBe('gemini-3.1-pro-preview')
  })

  it('propage l’erreur si le plan échoue (tous providers down)', async () => {
    vi.mocked(generateJson).mockRejectedValue(new Error('aucun provider disponible'))

    await expect(askLlm('test')).rejects.toThrow('aucun provider disponible')
  })

  it('appelle onStep pour la progression lors d’une recherche', async () => {
    vi.mocked(generateJson)
      .mockResolvedValueOnce(planResult({ needsWeb: true, searchQuery: 'foo', answer: '' }) as never)
      .mockResolvedValueOnce({ answer: 'ok' } as never)
    vi.mocked(gatherWebContext).mockResolvedValue({ text: '### r', sources: ['https://a'], results: [] })
    const steps: string[] = []

    await askLlm('cherche foo', { onStep: (m) => steps.push(m) })

    expect(steps.some((s) => s.includes('Recherche web'))).toBe(true)
  })
})
