export type AiProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'qwen' | 'kimi'

export interface AiModelInfo {
  id: string
  label: string
  pricing: { input: number; output: number }  // USD par 1M tokens
  isDefault?: boolean
}

export const AI_MODELS: Record<AiProvider, AiModelInfo[]> = {
  claude: [
    { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   pricing: { input: 15,   output: 75 }, isDefault: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', pricing: { input: 3,    output: 15 } },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  pricing: { input: 0.80, output: 4 } },
  ],
  gemini: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', pricing: { input: 1.25,  output: 10 },  isDefault: true },
    { id: 'gemini-3-flash',         label: 'Gemini 3 Flash',         pricing: { input: 0.075, output: 0.30 } },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o',      pricing: { input: 2.50, output: 10 },  isDefault: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', pricing: { input: 0.15, output: 0.60 } },
  ],
  deepseek: [
    { id: 'deepseek-chat',      label: 'DeepSeek Chat (V4)', pricing: { input: 0.27, output: 1.10 }, isDefault: true },
    { id: 'deepseek-reasoner',  label: 'DeepSeek Reasoner',  pricing: { input: 0.55, output: 2.19 } },
  ],
  qwen: [
    { id: 'qwen-max',    label: 'Qwen Max',    pricing: { input: 1.60, output: 6.40 }, isDefault: true },
    { id: 'qwen-plus',   label: 'Qwen Plus',   pricing: { input: 0.40, output: 1.20 } },
    { id: 'qwen-turbo',  label: 'Qwen Turbo',  pricing: { input: 0.05, output: 0.20 } },
  ],
  kimi: [
    { id: 'kimi-for-coding', label: 'Kimi for Coding', pricing: { input: 0, output: 0 }, isDefault: true },
  ],
}

export function getModel(provider: AiProvider, id: string): AiModelInfo | undefined {
  return AI_MODELS[provider].find((m) => m.id === id)
}

export function getDefaultModel(provider: AiProvider): AiModelInfo {
  const found = AI_MODELS[provider].find((m) => m.isDefault)
  if (!found) throw new Error(`AI_MODELS["${provider}"] sans entrée isDefault`)
  return found
}
