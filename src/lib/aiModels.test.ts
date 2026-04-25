import { describe, it, expect } from 'vitest'
import { AI_MODELS, getModel, getDefaultModel, type AiProvider } from './aiModels'

describe('aiModels catalog', () => {
  it('exports a default model for each provider', () => {
    const providers: AiProvider[] = ['claude', 'gemini', 'openai']
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
    expect(getDefaultModel('gemini').id).toBe('gemini-3.1-pro-preview')
    expect(getDefaultModel('openai').id).toBe('gpt-4o')
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
