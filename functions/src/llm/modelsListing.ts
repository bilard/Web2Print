// functions/src/llm/modelsListing.ts
/**
 * Construction de la requête GET `/models` par provider, exécutée côté serveur
 * (aucune contrainte CORS, contrairement au navigateur). Le parsing de la
 * réponse reste côté client (`src/lib/aiModelsListing.ts`).
 */

export type ListModelsProvider =
  | 'claude' | 'gemini' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'openrouter'

export const LIST_MODELS_PROVIDERS: readonly ListModelsProvider[] = [
  'claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter',
]

/** Clé Firestore (`users/{uid}.apiKeys.overrides[keyId]`) associée au provider. */
export function keyIdForListProvider(provider: ListModelsProvider): string {
  return provider === 'claude' ? 'anthropic' : provider
}

/** OpenRouter liste ses modèles sans authentification ; les autres exigent une clé. */
export function needsKeyForListing(provider: ListModelsProvider): boolean {
  return provider !== 'openrouter'
}

export interface ModelsRequestSpec {
  url: string
  headers: Record<string, string>
}

/** URL + headers du GET `/models` pour un provider donné. */
export function buildModelsRequest(provider: ListModelsProvider, apiKey: string): ModelsRequestSpec {
  const bearer: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  switch (provider) {
    case 'claude':
      return {
        url: 'https://api.anthropic.com/v1/models',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }
    case 'gemini':
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        headers: {},
      }
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: bearer }
    case 'deepseek':
      return { url: 'https://api.deepseek.com/v1/models', headers: bearer }
    case 'qwen':
      return { url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', headers: bearer }
    case 'kimi':
      return { url: 'https://api.kimi.com/coding/v1/models', headers: bearer }
    case 'glm':
      return { url: 'https://api.z.ai/api/paas/v4/models', headers: bearer }
    case 'openrouter':
      return { url: 'https://openrouter.ai/api/v1/models', headers: bearer }
  }
}
