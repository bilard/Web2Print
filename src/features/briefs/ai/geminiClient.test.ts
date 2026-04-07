import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'
import { generateJson } from './geminiClient'

const ResponseSchema = z.object({ items: z.array(z.string()) })

function mockGeminiResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    text: async () => text,
  } as Response
}

describe('generateJson', () => {
  beforeEach(() => {
    localStorage.setItem('designstudio_apikey_gemini', 'fake-key')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON when the response is valid', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockGeminiResponse('{"items":["a","b"]}'),
    )
    const result = await generateJson({
      prompt: 'list two letters',
      schema: ResponseSchema,
      schemaForGemini: { type: 'object' },
      version: 'test-1',
    })
    expect(result).toEqual({ items: ['a', 'b'] })
  })

  it('retries once with error injection when validation fails', async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[1,2]}')) // wrong types
      .mockResolvedValueOnce(mockGeminiResponse('{"items":["a","b"]}'))
    const result = await generateJson({
      prompt: 'list two letters',
      schema: ResponseSchema,
      schemaForGemini: { type: 'object' },
      version: 'test-1',
    })
    expect(result).toEqual({ items: ['a', 'b'] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    const secondPrompt = secondCallBody.contents[0].parts[0].text as string
    expect(secondPrompt).toContain('Erreur précédente')
  })

  it('throws after a second validation failure', async () => {
    ;(fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[1]}'))
      .mockResolvedValueOnce(mockGeminiResponse('{"items":[2]}'))
    await expect(
      generateJson({
        prompt: 'list',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/conforme/i)
  })

  it('throws when the API key is missing', async () => {
    localStorage.removeItem('designstudio_apikey_gemini')
    // Also unstub env in case .env.local has one — override with empty
    vi.stubEnv('VITE_GEMINI_API_KEY', '')
    await expect(
      generateJson({
        prompt: 'x',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/Clé Gemini/)
    vi.unstubAllEnvs()
  })

  it('throws on a non-2xx response', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockGeminiResponse('quota exceeded', false, 429),
    )
    await expect(
      generateJson({
        prompt: 'x',
        schema: ResponseSchema,
        schemaForGemini: { type: 'object' },
        version: 'test-1',
      }),
    ).rejects.toThrow(/429/)
  })
})
