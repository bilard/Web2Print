// functions/src/llm/proxyCore.test.ts
import { describe, it, expect } from 'vitest'
import { PROXY_PROVIDERS, buildProviderRequest, isOverBudget, keyIdForProvider } from './proxyCore'

describe('keyIdForProvider', () => {
  it('mappe claude sur la clé anthropic, les autres sur leur propre id', () => {
    expect(keyIdForProvider('claude')).toBe('anthropic')
    expect(keyIdForProvider('gemini')).toBe('gemini')
    expect(keyIdForProvider('openrouter')).toBe('openrouter')
  })
})

describe('buildProviderRequest', () => {
  it('claude : endpoint Anthropic + x-api-key SANS header direct-browser-access', () => {
    const spec = buildProviderRequest('claude', 'claude-opus-4-8', 'sk-test')
    expect(spec.url).toBe('https://api.anthropic.com/v1/messages')
    expect(spec.headers['x-api-key']).toBe('sk-test')
    expect(spec.headers['anthropic-version']).toBe('2023-06-01')
    expect(Object.keys(spec.headers)).not.toContain('anthropic-dangerous-direct-browser-access')
  })
  it('gemini : v1beta pour les modèles < 3.5, v1 pour 3.5+, clé en query param', () => {
    expect(buildProviderRequest('gemini', 'gemini-3.1-pro-preview', 'k').url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=k',
    )
    expect(buildProviderRequest('gemini', 'gemini-3.5-flash', 'k').url).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent?key=k',
    )
  })
  it('openai/deepseek/openrouter : Bearer', () => {
    expect(buildProviderRequest('openai', 'gpt-5.2', 'k').headers.authorization).toBe('Bearer k')
    expect(buildProviderRequest('deepseek', 'deepseek-chat', 'k').url).toContain('api.deepseek.com')
    const or = buildProviderRequest('openrouter', 'anthropic/claude-opus-4-8', 'k')
    expect(or.headers['http-referer']).toBe('https://ibs-studio.com')
  })
  it('PROXY_PROVIDERS couvre les 5 providers du routeur client', () => {
    expect([...PROXY_PROVIDERS].sort()).toEqual(['claude', 'deepseek', 'gemini', 'openai', 'openrouter'])
  })
})

describe('isOverBudget', () => {
  it('null/undefined/0 = pas de budget → jamais bloquant', () => {
    expect(isOverBudget(null, 999)).toBe(false)
    expect(isOverBudget(undefined, 999)).toBe(false)
    expect(isOverBudget(0, 999)).toBe(false)
  })
  it('bloque quand le dépensé atteint le budget', () => {
    expect(isOverBudget(10, 9.99)).toBe(false)
    expect(isOverBudget(10, 10)).toBe(true)
    expect(isOverBudget(10, 12)).toBe(true)
  })
})
