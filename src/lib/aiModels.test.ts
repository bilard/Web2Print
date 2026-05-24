import { describe, it, expect } from 'vitest'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider } from './aiModels'

describe('aiModels catalog', () => {
  it('exports a default model for each provider', () => {
    const providers: AiProvider[] = ['claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'openrouter']
    for (const p of providers) {
      const list = AI_MODELS[p]
      expect(list.length).toBeGreaterThan(0)
      const defaults = list.filter((m) => m.isDefault)
      expect(defaults.length).toBe(1)
    }
  })

  it('getModel returns the matching entry', () => {
    expect(getModel('claude', 'claude-opus-4-7')?.label).toBe('Claude Opus 4.7')
  })

  it('getModel returns undefined for unknown id', () => {
    expect(getModel('claude', 'nope')).toBeUndefined()
  })

  it('getDefaultModel returns the isDefault entry', () => {
    expect(getDefaultModel('claude').id).toBe('claude-opus-4-7')
    expect(getDefaultModel('gemini').id).toBe('gemini-3.5-flash')
    expect(getDefaultModel('openai').id).toBe('gpt-5.1')
    expect(getDefaultModel('deepseek').id).toBe('deepseek-chat')
    expect(getDefaultModel('qwen').id).toBe('qwen3.7-max')
    expect(getDefaultModel('kimi').id).toBe('kimi-k2.6')
    expect(getDefaultModel('openrouter').id).toBe('openrouter/auto')
  })

  it('all models have a non-negative pricing', () => {
    for (const list of Object.values(AI_MODELS)) {
      for (const m of list) {
        expect(m.pricing.input).toBeGreaterThanOrEqual(0)
        expect(m.pricing.output).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
