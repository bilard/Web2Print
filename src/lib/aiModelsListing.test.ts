// src/lib/aiModelsListing.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callMock = vi.hoisted(() => vi.fn())
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callMock,
}))
vi.mock('@/lib/firebase/config', () => ({ functions: {} }))

import { fetchModelsViaServer, MODEL_PARSERS } from './aiModelsListing'

beforeEach(() => {
  callMock.mockReset()
})

describe('MODEL_PARSERS.openrouter.extract', () => {
  it('convertit le pricing par token en USD / 1M tokens et filtre les modalités image/audio', () => {
    const models = MODEL_PARSERS.openrouter.extract({
      data: [
        { id: 'anthropic/claude', name: 'Claude', pricing: { prompt: '0.000003', completion: '0.000015' } },
        { id: 'some/image-gen', architecture: { modality: 'text+image' } },
      ],
    })
    expect(models).toHaveLength(1)
    expect(models[0]).toMatchObject({ id: 'anthropic/claude', label: 'Claude', pricing: { input: 3, output: 15 } })
  })
})

describe('MODEL_PARSERS.gemini.extract', () => {
  it('garde les gemini-* texte et écarte image/tts/embedding', () => {
    const models = MODEL_PARSERS.gemini.extract({
      models: [
        { name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash' },
        { name: 'models/gemini-3.1-flash-image-preview', displayName: 'Img' },
        { name: 'models/text-embedding-004' },
      ],
    })
    expect(models.map((m) => m.id)).toEqual(['gemini-3.6-flash'])
  })
})

describe('fetchModelsViaServer', () => {
  it('parse le body renvoyé par la CF sur succès', async () => {
    callMock.mockResolvedValue({
      data: { status: 200, body: JSON.stringify({ data: [{ id: 'deepseek-chat' }] }) },
    })
    const models = await fetchModelsViaServer('deepseek')
    expect(models).toEqual([{ id: 'deepseek-chat', label: 'deepseek-chat', pricing: { input: 0, output: 0 } }])
  })

  it('retombe sur le seed si la CF échoue et que le provider a un fallback (kimi)', async () => {
    callMock.mockRejectedValue(new Error('failed-precondition'))
    const models = await fetchModelsViaServer('kimi')
    expect(models).toEqual([{ id: 'kimi-for-coding', label: 'Kimi for Coding', pricing: { input: 0, output: 0 } }])
  })

  it('propage l’erreur si le provider n’a pas de fallback (gemini)', async () => {
    callMock.mockRejectedValue(new Error('clé gemini absente'))
    await expect(fetchModelsViaServer('gemini')).rejects.toThrow('clé gemini absente')
  })

  it('retombe sur le seed sur statut non-2xx (glm)', async () => {
    callMock.mockResolvedValue({ data: { status: 404, body: 'not found' } })
    const models = await fetchModelsViaServer('glm')
    expect(models.length).toBeGreaterThan(0)
    expect(models[0].id).toMatch(/^glm/)
  })
})
