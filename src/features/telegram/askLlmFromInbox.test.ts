import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/features/ai/llmRouter', () => ({
  generateJson: vi.fn(),
}))

import { generateJson } from '@/features/ai/llmRouter'
import { askLlm } from './askLlmFromInbox'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOpts = any

describe('askLlm', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne la réponse + le provider/modèle réellement utilisés (via onProviderUsed)', async () => {
    vi.mocked(generateJson).mockImplementation(async (opts: AnyOpts) => {
      opts.onProviderUsed?.({ provider: 'claude', model: 'claude-opus-4-7' })
      return { answer: 'Bonjour !' } as never
    })

    const res = await askLlm('Salut')

    expect(res).toEqual({ answer: 'Bonjour !', provider: 'claude', model: 'claude-opus-4-7' })
  })

  it('cible la tâche telegram.chat et injecte la question dans le prompt', async () => {
    vi.mocked(generateJson).mockResolvedValue({ answer: 'x' } as never)

    await askLlm('Quelle heure est-il ?')

    const opts = vi.mocked(generateJson).mock.calls[0][0] as AnyOpts
    expect(opts.task).toBe('telegram.chat')
    expect(opts.prompt).toContain('Quelle heure est-il ?')
    expect(opts.schemaForLLM.required).toContain('answer')
  })

  it('provider/model restent vides si la cascade ne notifie pas onProviderUsed', async () => {
    vi.mocked(generateJson).mockResolvedValue({ answer: 'y' } as never)

    const res = await askLlm('test')

    expect(res).toEqual({ answer: 'y', provider: '', model: '' })
  })

  it('propage l’erreur si tous les providers échouent', async () => {
    vi.mocked(generateJson).mockRejectedValue(new Error('aucun provider disponible'))

    await expect(askLlm('test')).rejects.toThrow('aucun provider disponible')
  })
})
