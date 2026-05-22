export type AiProvider = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter'

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
    { id: 'gemini-3.1-pro-preview',         label: 'Gemini 3.1 Pro Preview',          pricing: { input: 1.25,  output: 10 },   isDefault: true },
    { id: 'gemini-2.5-flash',               label: 'Gemini 2.5 Flash',                pricing: { input: 0.30,  output: 2.50 } },
    // Génération d'image (Nano Banana 2). Output facturé en "image tokens" :
    // ~1290 output tokens / image @ $30/1M → ~$0.039 / image. Input texte standard.
    { id: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image (NB2)',    pricing: { input: 0.30,  output: 30 } },
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
  // OpenRouter agrège ~370 modèles. Le seed ci-dessous est curé sur les flagships
  // actuels (mai 2026) regroupés par famille — l'utilisateur clique "Rafraîchir"
  // dans Paramètres pour récupérer le catalogue complet via /api/v1/models et
  // choisir un modèle hors de cette sélection.
  openrouter: [
    // Routing automatique
    { id: 'openrouter/auto',                          label: 'OpenRouter Auto (routing)',                  pricing: { input: 0,    output: 0 },    isDefault: true },

    // Anthropic — Claude
    { id: 'anthropic/claude-opus-4.7',                label: 'Claude Opus 4.7',                            pricing: { input: 5,    output: 25 } },
    { id: 'anthropic/claude-sonnet-4.6',              label: 'Claude Sonnet 4.6',                          pricing: { input: 3,    output: 15 } },
    { id: 'anthropic/claude-haiku-4.5',               label: 'Claude Haiku 4.5',                           pricing: { input: 1,    output: 5 } },

    // OpenAI — GPT
    { id: 'openai/gpt-5.5-pro',                       label: 'GPT-5.5 Pro',                                pricing: { input: 30,   output: 180 } },
    { id: 'openai/gpt-5.5',                           label: 'GPT-5.5',                                    pricing: { input: 5,    output: 30 } },
    { id: 'openai/gpt-5.4',                           label: 'GPT-5.4',                                    pricing: { input: 2.50, output: 15 } },
    { id: 'openai/gpt-5.1',                           label: 'GPT-5.1',                                    pricing: { input: 1.25, output: 10 } },
    { id: 'openai/gpt-5-mini',                        label: 'GPT-5 Mini',                                 pricing: { input: 0.25, output: 2 } },
    { id: 'openai/gpt-5-nano',                        label: 'GPT-5 Nano',                                 pricing: { input: 0.05, output: 0.40 } },
    { id: 'openai/o4-mini',                           label: 'o4 Mini',                                    pricing: { input: 1.10, output: 4.40 } },
    { id: 'openai/o3',                                label: 'o3',                                         pricing: { input: 2,    output: 8 } },
    { id: 'openai/gpt-oss-120b:free',                 label: 'gpt-oss 120B (free)',                        pricing: { input: 0,    output: 0 } },

    // Google — Gemini
    { id: 'google/gemini-3.1-pro-preview',            label: 'Gemini 3.1 Pro Preview',                     pricing: { input: 2,    output: 12 } },
    { id: 'google/gemini-3.1-flash-lite',             label: 'Gemini 3.1 Flash Lite',                      pricing: { input: 0.25, output: 1.50 } },
    { id: 'google/gemini-2.5-pro',                    label: 'Gemini 2.5 Pro',                             pricing: { input: 1.25, output: 10 } },
    { id: 'google/gemini-2.5-flash',                  label: 'Gemini 2.5 Flash',                           pricing: { input: 0.30, output: 2.50 } },

    // xAI — Grok
    { id: 'x-ai/grok-4.3',                            label: 'Grok 4.3',                                   pricing: { input: 1.25, output: 2.50 } },
    { id: 'x-ai/grok-4.20',                           label: 'Grok 4.20',                                  pricing: { input: 1.25, output: 2.50 } },
    { id: 'x-ai/grok-4-fast',                         label: 'Grok 4 Fast',                                pricing: { input: 0.20, output: 0.50 } },

    // DeepSeek
    { id: 'deepseek/deepseek-v4-pro',                 label: 'DeepSeek V4 Pro',                            pricing: { input: 0.43, output: 0.87 } },
    { id: 'deepseek/deepseek-v4-flash',               label: 'DeepSeek V4 Flash',                          pricing: { input: 0.14, output: 0.28 } },
    { id: 'deepseek/deepseek-r1',                     label: 'DeepSeek R1',                                pricing: { input: 0.70, output: 2.50 } },

    // Qwen / Alibaba
    { id: 'qwen/qwen3-max',                           label: 'Qwen3 Max',                                  pricing: { input: 0.78, output: 3.90 } },
    { id: 'qwen/qwen3-coder',                         label: 'Qwen3 Coder 480B',                           pricing: { input: 0.22, output: 1.80 } },
    { id: 'qwen/qwen3-235b-a22b-2507',                label: 'Qwen3 235B Instruct',                        pricing: { input: 0.07, output: 0.10 } },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free',    label: 'Qwen3 Next 80B (free)',                      pricing: { input: 0,    output: 0 } },

    // Moonshot — Kimi
    { id: 'moonshotai/kimi-k2.6',                     label: 'Kimi K2.6',                                  pricing: { input: 0.75, output: 3.50 } },
    { id: 'moonshotai/kimi-k2-thinking',              label: 'Kimi K2 Thinking',                           pricing: { input: 0.60, output: 2.50 } },

    // Mistral
    { id: 'mistralai/mistral-large-2512',             label: 'Mistral Large 3 (2512)',                     pricing: { input: 0.50, output: 1.50 } },
    { id: 'mistralai/mistral-medium-3.5',             label: 'Mistral Medium 3.5',                         pricing: { input: 1.50, output: 7.50 } },
    { id: 'mistralai/codestral-2508',                 label: 'Codestral 2508',                             pricing: { input: 0.30, output: 0.90 } },

    // Z.ai — GLM
    { id: 'z-ai/glm-5.1',                             label: 'GLM 5.1',                                    pricing: { input: 1.05, output: 3.50 } },
    { id: 'z-ai/glm-4.7',                             label: 'GLM 4.7',                                    pricing: { input: 0.38, output: 1.74 } },
    { id: 'z-ai/glm-4.5-air:free',                    label: 'GLM 4.5 Air (free)',                         pricing: { input: 0,    output: 0 } },

    // Meta — Llama
    { id: 'meta-llama/llama-3.3-70b-instruct',        label: 'Llama 3.3 70B Instruct',                     pricing: { input: 0.10, output: 0.32 } },
    { id: 'meta-llama/llama-3.3-70b-instruct:free',   label: 'Llama 3.3 70B (free)',                       pricing: { input: 0,    output: 0 } },
    { id: 'meta-llama/llama-4-maverick',              label: 'Llama 4 Maverick',                           pricing: { input: 0.15, output: 0.60 } },

    // Perplexity
    { id: 'perplexity/sonar-pro',                     label: 'Perplexity Sonar Pro',                       pricing: { input: 3,    output: 15 } },
    { id: 'perplexity/sonar',                         label: 'Perplexity Sonar',                           pricing: { input: 1,    output: 1 } },

    // Cohere
    { id: 'cohere/command-a',                         label: 'Cohere Command A',                           pricing: { input: 2.50, output: 10 } },
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
