// src/lib/llmProxyClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const callMock = vi.hoisted(() => vi.fn())
const apiKeyMock = vi.hoisted(() => vi.fn(() => ''))
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callMock,
}))
vi.mock('@/lib/firebase/config', () => ({ functions: {} }))
vi.mock('@/lib/apiKeys', () => ({ getApiKey: apiKeyMock }))

import { llmFetchViaProxy, llmPostWithFallback, LlmBudgetError } from './llmProxyClient'

// Accolades obligatoires : mockReset() retourne le mock (chaînable), et un hook
// qui retourne une fonction la voit appelée comme teardown par Vitest → l'appel
// parasite du mock produirait un « unhandled rejection » sur les tests rejetés.
beforeEach(() => {
  callMock.mockReset()
})

describe('llmFetchViaProxy', () => {
  it('retourne une réponse compatible Response sur succès proxy', async () => {
    callMock.mockResolvedValue({ data: { status: 200, body: '{"ok":true}' } })
    const fallback = vi.fn()
    const res = await llmFetchViaProxy('claude', 'claude-opus-4-8', { messages: [] }, fallback)
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"ok":true}')
    expect(await res.json()).toEqual({ ok: true })
    expect(fallback).not.toHaveBeenCalled()
  })

  it('propage le status provider non-2xx sans fallback (erreur provider ≠ erreur proxy)', async () => {
    callMock.mockResolvedValue({ data: { status: 429, body: 'rate limited' } })
    const fallback = vi.fn()
    const res = await llmFetchViaProxy('gemini', 'gemini-3.1-pro-preview', {}, fallback)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(429)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('budget atteint (resource-exhausted) → LlmBudgetError, PAS de fallback direct', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('budget'), { code: 'functions/resource-exhausted' }))
    const fallback = vi.fn()
    await expect(llmFetchViaProxy('claude', 'm', {}, fallback)).rejects.toBeInstanceOf(LlmBudgetError)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('proxy indisponible → fallback direct', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('down'), { code: 'functions/internal' }))
    const fallback = vi.fn().mockResolvedValue(new Response('direct', { status: 200 }))
    const res = await llmFetchViaProxy('openai', 'gpt-5.2', {}, fallback)
    expect(fallback).toHaveBeenCalledOnce()
    expect(await res.text()).toBe('direct')
  })

  it('payload > 9 Mo → fallback direct sans tenter la callable', async () => {
    const fallback = vi.fn().mockResolvedValue(new Response('direct', { status: 200 }))
    const big = { data: 'x'.repeat(9_500_000) }
    await llmFetchViaProxy('gemini', 'm', big, fallback)
    expect(callMock).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
  })
})

describe('llmPostWithFallback', () => {
  it('passe par le proxy quand il répond', async () => {
    callMock.mockResolvedValue({ data: { status: 200, body: '{"r":1}' } })
    const res = await llmPostWithFallback('gemini', 'gemini-3.1-pro-preview', { contents: [] })
    expect(res.ok).toBe(true)
    expect(await res.json()).toEqual({ r: 1 })
  })

  it('proxy indisponible : fallback direct standard avec la clé locale (Gemini en query param)', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('down'), { code: 'functions/internal' }))
    apiKeyMock.mockReturnValue('local-key')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await llmPostWithFallback('gemini', 'gemini-3.1-pro-preview', { contents: [] })
      expect(fetchMock).toHaveBeenCalledOnce()
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('v1beta/models/gemini-3.1-pro-preview:generateContent?key=local-key')
    } finally {
      vi.unstubAllGlobals()
      apiKeyMock.mockReturnValue('')
    }
  })

  it('proxy indisponible ET clé locale absente → erreur explicite', async () => {
    callMock.mockRejectedValue(Object.assign(new Error('down'), { code: 'functions/unavailable' }))
    apiKeyMock.mockReturnValue('')
    await expect(llmPostWithFallback('claude', 'claude-opus-4-8', { messages: [] }))
      .rejects.toThrow(/Clé anthropic absente/)
  })
})
