import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAiSettingsStore,
  getSelectedModel,
  getEffectiveModelList,
} from './aiSettings.store'

describe('aiSettings.store', () => {
  beforeEach(() => {
    localStorage.clear()
    useAiSettingsStore.setState({
      selectedModel: { claude: 'claude-opus-4-7', gemini: 'gemini-3.1-pro-preview', openai: 'gpt-4o', deepseek: 'deepseek-chat', qwen: 'qwen-max', kimi: 'kimi-for-coding', openrouter: 'openrouter/auto' },
      fetchedModels: { claude: [], gemini: [], openai: [], deepseek: [], qwen: [], kimi: [], openrouter: [] },
    })
  })

  it('initialises selectedModel with catalog defaults', () => {
    expect(getSelectedModel('claude')).toBe('claude-opus-4-7')
    expect(getSelectedModel('gemini')).toBe('gemini-3.1-pro-preview')
    expect(getSelectedModel('openai')).toBe('gpt-4o')
    expect(getSelectedModel('deepseek')).toBe('deepseek-chat')
    expect(getSelectedModel('qwen')).toBe('qwen-max')
    expect(getSelectedModel('kimi')).toBe('kimi-for-coding')
  })

  it('setSelectedModel updates selection', () => {
    useAiSettingsStore.getState().setSelectedModel('claude', 'claude-sonnet-4-6')
    expect(getSelectedModel('claude')).toBe('claude-sonnet-4-6')
  })

  it('getSelectedModel falls back to default if stored id is unknown', () => {
    useAiSettingsStore.setState({
      selectedModel: { claude: 'ghost-model', gemini: 'gemini-3.1-pro-preview', openai: 'gpt-4o', deepseek: 'deepseek-chat', qwen: 'qwen-max', kimi: 'kimi-for-coding', openrouter: 'openrouter/auto' },
      fetchedModels: { claude: [], gemini: [], openai: [], deepseek: [], qwen: [], kimi: [], openrouter: [] },
    })
    expect(getSelectedModel('claude')).toBe('claude-opus-4-7')
  })

  it('getEffectiveModelList merges catalog + fetchedModels (catalog wins on dedup)', () => {
    useAiSettingsStore.getState().setFetchedModels('claude', [
      { id: 'claude-opus-4-7', label: 'OVERRIDDEN', pricing: { input: 0, output: 0 } },
      { id: 'claude-future-99', label: 'Claude Future', pricing: { input: 0, output: 0 } },
    ])
    const list = getEffectiveModelList('claude')
    expect(list.find((m) => m.id === 'claude-opus-4-7')?.label).toBe('Claude Opus 4.7')
    expect(list.find((m) => m.id === 'claude-future-99')?.label).toBe('Claude Future')
  })

  it('persist does not serialise fetchedModels (must stay ephemeral per spec)', () => {
    useAiSettingsStore.getState().setFetchedModels('claude', [
      { id: 'claude-future-99', label: 'Claude Future', pricing: { input: 0, output: 0 } },
    ])
    const raw = JSON.parse(localStorage.getItem('designstudio_ai_settings') ?? '{}')
    expect(raw.state?.fetchedModels).toBeUndefined()
    expect(raw.state?.selectedModel).toBeDefined()
  })
})
